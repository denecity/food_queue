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

function StockRow({
  item,
  showLocation,
  open,
  onToggle,
  onPatch,
  onRemove,
}: {
  item: StockItem
  showLocation?: boolean
  open: boolean
  onToggle: () => void
  onPatch: (body: Partial<Pick<StockItem, 'quantity' | 'unit' | 'location' | 'expires_on'>>) => void
  onRemove: () => void
}) {
  const loc = locationMeta(item.location)
  return (
    <div className="rounded-lg border border-line overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 py-2 px-2.5 text-left active:bg-bg-hover">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-ink truncate">{item.ingredient}</span>
            {item.staple && <span className="shrink-0 text-[10px] text-ink-faint border border-line rounded px-1">staple</span>}
          </div>
          <div className="flex items-center gap-2 text-sm text-ink-dim">
            {(item.quantity != null || item.unit) && <span>{formatQty(item.quantity, item.unit)}</span>}
            {showLocation && <span className="text-ink-faint">{loc.emoji} {loc.label}</span>}
          </div>
        </div>
        <ExpiryChip iso={item.expires_on} />
      </button>

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
            <label className="flex-1 text-xs text-ink-dim space-y-1">
              Unit
              <input
                className="field !py-1.5"
                defaultValue={item.unit ?? ''}
                onBlur={(e) => onPatch({ unit: e.target.value.trim() || null })}
              />
            </label>
          </div>

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
  onRemove,
}: {
  items: StockItem[]
  loading: boolean
  onAdd: (body: { ingredient: string }) => void
  onPatch: (id: string, body: Partial<Pick<StockItem, 'quantity' | 'unit' | 'location' | 'expires_on'>>) => void
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
              <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-1.5">
                ⚠️ Expiring soon
              </h3>
              <div className="space-y-1.5">
                {soon.map((i) => (
                  <StockRow
                    key={i.id}
                    item={i}
                    showLocation
                    open={openId === i.id}
                    onToggle={() => toggle(i.id)}
                    onPatch={(b) => onPatch(i.id, b)}
                    onRemove={() => onRemove(i.id)}
                  />
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
                    <StockRow
                      key={i.id}
                      item={i}
                      open={openId === i.id}
                      onToggle={() => toggle(i.id)}
                      onPatch={(b) => onPatch(i.id, b)}
                      onRemove={() => onRemove(i.id)}
                    />
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
