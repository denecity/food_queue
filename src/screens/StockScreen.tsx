import { useState } from 'react'
import type { StockItem, StockLocation } from '../lib/types'
import {
  LOCATION_ORDER,
  locationMeta,
  expiryMeta,
  daysUntil,
  EXPIRING_SOON_DAYS,
  formatQty,
  type ExpiryTone,
} from '../lib/ui'

const TONE_CLASS: Record<ExpiryTone, string> = {
  overdue: 'bg-red-500/15 text-red-400',
  soon: 'bg-amber-500/15 text-amber-400',
  ok: 'bg-bg-hover text-ink-dim',
}

function ExpiryChip({ iso }: { iso: string | null }) {
  const meta = expiryMeta(iso)
  if (!meta) return null
  return (
    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${TONE_CLASS[meta.tone]}`}>
      {meta.tone === 'overdue' ? '⚠ ' : ''}
      {meta.label}
    </span>
  )
}

function Stepper({ onInc }: { onInc: (dir: 1 | -1) => void }) {
  const cls =
    'w-7 h-7 rounded-md border border-line text-ink-dim active:bg-bg-hover flex items-center justify-center text-lg leading-none select-none'
  return {
    minus: <button className={cls} onClick={() => onInc(-1)} aria-label="less">−</button>,
    plus: <button className={cls} onClick={() => onInc(1)} aria-label="more">+</button>,
  }
}

function StockRow({
  item,
  showLocation,
  open,
  onToggle,
  onInc,
  onPatch,
  onEditIngredient,
  onRemove,
}: {
  item: StockItem
  showLocation?: boolean
  open: boolean
  onToggle: () => void
  onInc: (dir: 1 | -1) => void
  onPatch: (body: Partial<Pick<StockItem, 'quantity' | 'expires_on' | 'location'>>) => void
  onEditIngredient: (body: { default_unit?: string | null; step?: number | null }) => void
  onRemove: () => void
}) {
  const loc = locationMeta(item.location)
  const step = Stepper({ onInc })
  return (
    <div className="rounded-lg border border-line overflow-hidden">
      <div className="flex items-center gap-2 py-2 px-2.5">
        <button onClick={onToggle} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-ink truncate">{item.ingredient}</span>
            {item.staple && <span className="shrink-0 text-[10px] text-ink-faint border border-line rounded px-1">staple</span>}
          </div>
          {showLocation && <div className="text-xs text-ink-faint">{loc.emoji} {loc.label}</div>}
        </button>
        <ExpiryChip iso={item.expires_on} />
        <div className="flex items-center gap-1 shrink-0">
          {step.minus}
          <span className="text-sm text-ink tabular-nums min-w-[3.25rem] text-center">
            {item.quantity != null || item.unit ? formatQty(item.quantity, item.unit) : '—'}
          </span>
          {step.plus}
        </div>
      </div>

      {open && (
        <div className="px-2.5 pb-3 pt-1 space-y-3 border-t border-line bg-bg-hover/40">
          <div className="flex gap-2">
            <label className="flex-1 text-xs text-ink-dim space-y-1">
              Quantity
              <input
                type="number"
                inputMode="decimal"
                className="field !py-1.5"
                defaultValue={item.quantity ?? ''}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  onPatch({ quantity: v === '' ? null : Number(v) })
                }}
              />
            </label>
            <label className="w-24 text-xs text-ink-dim space-y-1">
              Unit
              <input
                className="field !py-1.5"
                defaultValue={item.unit ?? ''}
                onBlur={(e) => {
                  const u = e.target.value.trim() || null
                  if (u !== (item.unit ?? null)) onEditIngredient({ default_unit: u })
                }}
              />
            </label>
            <label className="w-20 text-xs text-ink-dim space-y-1">
              Step
              <input
                type="number"
                inputMode="decimal"
                className="field !py-1.5"
                defaultValue={item.step}
                onBlur={(e) => {
                  const s = Number(e.target.value)
                  if (Number.isFinite(s) && s > 0 && s !== item.step) onEditIngredient({ step: s })
                }}
              />
            </label>
          </div>
          <p className="text-[11px] text-ink-faint -mt-1">Unit &amp; step apply to this ingredient everywhere.</p>

          <label className="block text-xs text-ink-dim space-y-1">
            Expires
            <input
              type="date"
              className="field !py-1.5"
              defaultValue={item.expires_on ?? ''}
              onChange={(e) => onPatch({ expires_on: e.target.value || null })}
            />
          </label>

          <div className="text-xs text-ink-dim space-y-1">
            Location
            <div className="grid grid-cols-4 gap-1.5">
              {LOCATION_ORDER.map((l) => {
                const m = locationMeta(l)
                const on = item.location === l
                return (
                  <button
                    key={l}
                    onClick={() => onPatch({ location: l as StockLocation })}
                    className={`py-1.5 rounded-md text-[11px] font-medium border ${
                      on ? 'bg-accent/15 border-accent text-accent' : 'border-line text-ink-dim'
                    }`}
                  >
                    {m.emoji} {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          <button onClick={onRemove} className="text-sm text-skip font-medium">
            Used up / remove
          </button>
        </div>
      )}
    </div>
  )
}

export function StockScreen({
  items,
  loading,
  onAdd,
  onPatch,
  onIncrement,
  onEditIngredient,
  onRemove,
}: {
  items: StockItem[]
  loading: boolean
  onAdd: (body: { ingredient: string }) => void
  onPatch: (id: string, body: Partial<Pick<StockItem, 'quantity' | 'expires_on' | 'location'>>) => void
  onIncrement: (item: StockItem, dir: 1 | -1) => void
  onEditIngredient: (ingredientId: string, body: { default_unit?: string | null; step?: number | null }) => void
  onRemove: (id: string) => void
}) {
  const [text, setText] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const soon = items
    .filter((i) => {
      const d = daysUntil(i.expires_on)
      return d != null && d <= EXPIRING_SOON_DAYS
    })
    .sort((a, b) => (daysUntil(a.expires_on) ?? 0) - (daysUntil(b.expires_on) ?? 0))
  const soonIds = new Set(soon.map((i) => i.id))

  const groups = LOCATION_ORDER.map((loc) => ({
    loc,
    items: items
      .filter((i) => (i.location ?? 'pantry') === loc && !soonIds.has(i.id))
      .sort((a, b) => a.ingredient.localeCompare(b.ingredient)),
  })).filter((g) => g.items.length > 0)

  function submit() {
    const t = text.trim()
    if (!t) return
    onAdd({ ingredient: t })
    setText('')
  }

  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id))

  const rowProps = (i: StockItem) => ({
    item: i,
    open: openId === i.id,
    onToggle: () => toggle(i.id),
    onInc: (dir: 1 | -1) => onIncrement(i, dir),
    onPatch: (b: Partial<Pick<StockItem, 'quantity' | 'expires_on' | 'location'>>) => onPatch(i.id, b),
    onEditIngredient: (b: { default_unit?: string | null; step?: number | null }) => onEditIngredient(i.ingredient_id, b),
    onRemove: () => onRemove(i.id),
  })

  return (
    <div className="px-4 pt-4 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Stock</h1>
        <span className="text-sm text-ink-dim">{items.length} items</span>
      </div>

      <div className="flex gap-2">
        <input
          className="field"
          placeholder="Add to the fridge/pantry…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
        <button className="btn-ghost shrink-0" onClick={submit}>Add</button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-ink-dim">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-ink-dim space-y-1">
          <div className="text-4xl">🧊</div>
          <p>Nothing tracked yet. Add items here, or just tell Claude what you bought.</p>
        </div>
      ) : (
        <>
          {soon.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-1.5">⚠️ Expiring soon</h3>
              <div className="space-y-1.5">
                {soon.map((i) => (
                  <StockRow key={i.id} showLocation {...rowProps(i)} />
                ))}
              </div>
            </div>
          )}

          {groups.map((g) => {
            const m = locationMeta(g.loc)
            return (
              <div key={g.loc}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-dim mb-1.5">
                  {m.emoji} {m.label}
                </h3>
                <div className="space-y-1.5">
                  {g.items.map((i) => (
                    <StockRow key={i.id} {...rowProps(i)} />
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
