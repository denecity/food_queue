import { useMemo, useState } from 'react'
import type { RegisterIngredient } from '../lib/types'
import { CATEGORY_ORDER, categoryMeta } from '../lib/ui'
import { Sheet } from '../components/Sheet'

const UNITS = ['g', 'ml', 'pcs'] as const

type NewIngredient = { name: string; unit?: string; category?: string; staple?: boolean }

function AddIngredientDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (b: NewIngredient) => void }) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<'pcs' | 'g' | 'ml'>('pcs')
  const [category, setCategory] = useState('other')
  const [staple, setStaple] = useState(false)

  function submit() {
    const t = name.trim()
    if (!t) return
    onCreate({ name: t, unit, category, staple })
    onClose()
  }

  return (
    <Sheet
      title="Add ingredient"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-line flex-1">Cancel</button>
          <button onClick={submit} className="btn-ghost flex-1" disabled={!name.trim()}>Add</button>
        </>
      }
    >
      <label className="block text-xs text-ink-dim space-y-1">
        Name
        <input className="field" autoFocus placeholder="e.g. Miso paste" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
      </label>
      <div className="text-xs text-ink-dim space-y-1">
        Unit
        <div className="grid grid-cols-3 gap-1.5">
          {UNITS.map((u) => (
            <button key={u} onClick={() => setUnit(u)} className={`py-2 rounded-md text-xs font-medium border ${unit === u ? 'bg-accent/15 border-accent text-accent' : 'border-line text-ink-dim'}`}>{u}</button>
          ))}
        </div>
      </div>
      <label className="block text-xs text-ink-dim space-y-1">
        Category
        <select className="field !py-2" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{categoryMeta(c).label}</option>)}
        </select>
      </label>
      <button onClick={() => setStaple((s) => !s)} className={`text-xs rounded-md px-2.5 py-1.5 border ${staple ? 'bg-like/15 border-like text-like' : 'border-line text-ink-dim'}`}>
        {staple ? '✓ Staple (always on hand)' : 'Mark as staple'}
      </button>
    </Sheet>
  )
}

function Row({
  ing,
  open,
  onToggle,
  onPatch,
}: {
  ing: RegisterIngredient
  open: boolean
  onToggle: () => void
  onPatch: (body: { default_unit?: string; step?: number; staple?: boolean }) => void
}) {
  return (
    <div className="rounded-lg border border-line overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 py-2 px-2.5 text-left active:bg-bg-hover">
        {ing.stock_count > 0 && <span className="w-1.5 h-1.5 rounded-full bg-like shrink-0" title="in stock" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-ink truncate">{ing.canonical_name}</span>
            {ing.staple && <span className="shrink-0 text-[10px] text-ink-faint border border-line rounded px-1">staple</span>}
          </div>
          <div className="text-xs text-ink-faint">
            {ing.default_unit ?? '—'} · step {ing.step}
            {ing.recipe_count > 0 && <span> · in {ing.recipe_count} recipe{ing.recipe_count > 1 ? 's' : ''}</span>}
          </div>
        </div>
      </button>

      {open && (
        <div className="px-2.5 pb-3 pt-1 space-y-3 border-t border-line bg-bg-hover/40">
          <div className="grid grid-cols-2 gap-2">
            <div className="text-xs text-ink-dim space-y-1">
              Unit
              <div className="grid grid-cols-3 gap-1">
                {UNITS.map((u) => (
                  <button
                    key={u}
                    onClick={() => onPatch({ default_unit: u })}
                    className={`py-1.5 rounded-md text-[11px] font-medium border ${
                      ing.default_unit === u ? 'bg-accent/15 border-accent text-accent' : 'border-line text-ink-dim'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <label className="text-xs text-ink-dim space-y-1">
              Step
              <input
                type="number"
                inputMode="decimal"
                className="field !py-1.5"
                defaultValue={ing.step}
                onBlur={(e) => {
                  const s = Number(e.target.value)
                  if (Number.isFinite(s) && s > 0 && s !== ing.step) onPatch({ step: s })
                }}
              />
            </label>
          </div>

          <button
            onClick={() => onPatch({ staple: !ing.staple })}
            className={`text-xs rounded-md px-2.5 py-1.5 border ${
              ing.staple ? 'bg-like/15 border-like text-like' : 'border-line text-ink-dim'
            }`}
          >
            {ing.staple ? '✓ Staple (always on hand)' : 'Mark as staple'}
          </button>

          {ing.aliases.length > 0 && (
            <div className="text-[11px] text-ink-faint">merged: {ing.aliases.join(', ')}</div>
          )}
        </div>
      )}
    </div>
  )
}

export function IngredientsScreen({
  items,
  loading,
  onPatch,
  onCreate,
}: {
  items: RegisterIngredient[]
  loading: boolean
  onPatch: (id: string, body: { default_unit?: string; step?: number; staple?: boolean }) => void
  onCreate: (body: NewIngredient) => void
}) {
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return items
    return items.filter((i) => i.canonical_name.toLowerCase().includes(t) || i.aliases.some((a) => a.includes(t)))
  }, [items, q])

  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: filtered.filter((i) => (i.category ?? 'other') === cat),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Ingredients</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-dim">{items.length}</span>
          <button onClick={() => setAdding(true)} className="w-9 h-9 rounded-full bg-accent text-white text-xl leading-none flex items-center justify-center active:scale-95" aria-label="Add ingredient">+</button>
        </div>
      </div>

      <input className="field" placeholder="Search ingredients…" value={q} onChange={(e) => setQ(e.target.value)} />

      {adding && <AddIngredientDialog onClose={() => setAdding(false)} onCreate={onCreate} />}

      {loading ? (
        <div className="text-center py-16 text-ink-dim">Loading…</div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const meta = categoryMeta(g.cat)
            return (
              <div key={g.cat}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-dim mb-1.5">
                  {meta.emoji} {meta.label} ({g.items.length})
                </h3>
                <div className="space-y-1.5">
                  {g.items.map((i) => (
                    <Row
                      key={i.id}
                      ing={i}
                      open={openId === i.id}
                      onToggle={() => setOpenId((c) => (c === i.id ? null : i.id))}
                      onPatch={(b) => onPatch(i.id, b)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
