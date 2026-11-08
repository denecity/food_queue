import { useMemo, useState } from 'react'
import type { ConsumePayload, RecipeUsage, UsageLine } from '../lib/types'

function fmt(n: number | null, unit: string | null): string {
  if (n == null) return unit ?? ''
  const v = Math.round(n * 100) / 100
  return unit ? `${v} ${unit}` : String(v)
}

/**
 * Cook reconciliation. Opens when a dish is marked cooked: each ingredient is
 * pre-filled to subtract its used amount from stock (showing what's left); you can
 * correct the amount, mark it fully used up, or — for things not in stock — ignore
 * them or add what you've got. Confirm applies it and marks the dish cooked.
 */
export function ReconcileSheet({
  usage,
  loading,
  busy,
  onCancel,
  onConfirm,
}: {
  usage: RecipeUsage | null
  loading: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: (payload: ConsumePayload) => void
}) {
  const inStock = useMemo(() => (usage?.lines ?? []).filter((l) => l.ingredient_id && l.on_hand > 0), [usage])
  const missing = useMemo(() => (usage?.lines ?? []).filter((l) => !(l.ingredient_id && l.on_hand > 0)), [usage])

  // take[key] = amount to subtract; action[key] = what to do with a not-in-stock line.
  const [take, setTake] = useState<Record<string, number>>({})
  const [addFor, setAddFor] = useState<Record<string, number>>({})

  const keyOf = (l: UsageLine) => l.ingredient_id ?? `name:${l.ingredient.toLowerCase()}`
  const takeFor = (l: UsageLine) => {
    const k = keyOf(l)
    return k in take ? take[k] : l.needed ?? 0
  }

  function confirm() {
    const consume = inStock
      .map((l) => ({ ingredient_id: l.ingredient_id as string, amount: takeFor(l) }))
      .filter((c) => c.amount > 0)
    const add = missing
      .filter((l) => keyOf(l) in addFor)
      .map((l) => ({ ingredient: l.ingredient, quantity: addFor[keyOf(l)] || null, unit: l.unit }))
    onConfirm({ consume, add })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onCancel}>
      <div
        className="w-full max-w-2xl bg-bg-card rounded-t-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="px-4 pt-4 pb-2 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-ink truncate">🍳 Cooked{usage ? `: ${usage.recipe.name}` : ''}</h2>
              <p className="text-xs text-ink-dim">Update what's left in stock. {usage ? `${usage.servings} servings` : ''}</p>
            </div>
            <button onClick={onCancel} className="text-ink-faint text-xl leading-none px-1">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-2">
          {loading ? (
            <div className="text-center py-12 text-ink-dim">Checking your stock…</div>
          ) : !usage || usage.lines.length === 0 ? (
            <div className="text-center py-10 text-ink-dim">No tracked ingredients for this dish — nothing to deduct.</div>
          ) : (
            <>
              {inStock.length > 0 && (
                <div className="space-y-2">
                  {inStock.map((l) => {
                    const k = keyOf(l)
                    const t = takeFor(l)
                    const after = Math.round((l.on_hand - t) * 100) / 100
                    return (
                      <div key={k} className="rounded-lg border border-line p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ink font-medium truncate">{l.ingredient}</span>
                          <span className={`text-xs ${after < 0 ? 'text-amber-400' : 'text-ink-faint'}`}>
                            {after < 0 ? 'not enough — ' : 'leaves '}
                            {fmt(Math.max(after, 0), l.unit)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-ink-dim">Use</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            className="field !py-1 !w-24"
                            value={t}
                            onChange={(e) => setTake((s) => ({ ...s, [k]: Number(e.target.value) || 0 }))}
                          />
                          <span className="text-xs text-ink-dim">{l.unit} · of {fmt(l.on_hand, l.unit)}</span>
                          <button
                            className="ml-auto text-xs btn-line !py-1 !px-2"
                            onClick={() => setTake((s) => ({ ...s, [k]: l.on_hand }))}
                          >
                            Use up
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {missing.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Not in stock</h3>
                  {missing.map((l) => {
                    const k = keyOf(l)
                    const adding = k in addFor
                    return (
                      <div key={k} className="rounded-lg border border-line p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ink truncate">{l.ingredient}</span>
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              className={`text-xs rounded-md px-2 py-1 border ${adding ? 'border-line text-ink-dim' : 'bg-bg-hover border-line text-ink'}`}
                              onClick={() => setAddFor((s) => { const n = { ...s }; delete n[k]; return n })}
                            >
                              Ignore
                            </button>
                            <button
                              className={`text-xs rounded-md px-2 py-1 border ${adding ? 'bg-accent/15 border-accent text-accent' : 'border-line text-ink-dim'}`}
                              onClick={() => setAddFor((s) => ({ ...s, [k]: l.needed ?? l.step ?? 1 }))}
                            >
                              Add to stock
                            </button>
                          </div>
                        </div>
                        {adding && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-ink-dim">Qty</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              className="field !py-1 !w-24"
                              value={addFor[k]}
                              onChange={(e) => setAddFor((s) => ({ ...s, [k]: Number(e.target.value) || 0 }))}
                            />
                            <span className="text-xs text-ink-dim">{l.unit}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 px-4 py-3 border-t border-line flex gap-2">
          <button onClick={onCancel} className="btn-line flex-1" disabled={busy}>Cancel</button>
          <button onClick={confirm} className="btn-ghost flex-1" disabled={busy || loading}>
            {busy ? 'Saving…' : 'Subtract & mark cooked'}
          </button>
        </div>
      </div>
    </div>
  )
}
