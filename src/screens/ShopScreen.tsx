import { useState } from 'react'
import type { GroceryItem } from '../lib/types'
import { CATEGORY_ORDER, categoryMeta, formatQty } from '../lib/ui'

export function ShopScreen({
  items,
  loading,
  onToggle,
  onAdd,
  onRemove,
  onBuild,
  onClearChecked,
}: {
  items: GroceryItem[]
  loading: boolean
  onToggle: (id: string, checked: boolean) => void
  onAdd: (name: string) => void
  onRemove: (id: string) => void
  onBuild: () => void
  onClearChecked: () => void
}) {
  const [text, setText] = useState('')
  const checkedCount = items.filter((i) => i.checked).length

  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: items
      .filter((i) => (i.category ?? 'other') === cat)
      .sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length > 0)

  function submit() {
    const t = text.trim()
    if (!t) return
    onAdd(t)
    setText('')
  }

  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Shopping list</h1>
        <span className="text-sm text-ink-dim">{items.length - checkedCount} left</span>
      </div>

      <div className="flex gap-2">
        <input
          className="field"
          placeholder="Add an item…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
        <button className="btn-ghost shrink-0" onClick={submit}>Add</button>
      </div>

      <div className="flex gap-2">
        <button onClick={onBuild} className="btn-line flex-1 !py-2 text-sm">🔄 Rebuild from picks</button>
        {checkedCount > 0 && (
          <button onClick={onClearChecked} className="btn-line flex-1 !py-2 text-sm">Clear checked ({checkedCount})</button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-ink-dim">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-ink-dim space-y-1">
          <div className="text-4xl">🛒</div>
          <p>List is empty. Add items or rebuild from your picks.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const meta = categoryMeta(g.cat)
            return (
              <div key={g.cat}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-dim mb-1.5">
                  {meta.emoji} {meta.label}
                </h3>
                <div className="space-y-1">
                  {g.items.map((i) => (
                    <div key={i.id} className="flex items-center gap-3 py-2 px-2 rounded-lg active:bg-bg-hover">
                      <button
                        onClick={() => onToggle(i.id, !i.checked)}
                        className={`w-6 h-6 rounded-md border-2 shrink-0 flex items-center justify-center text-sm ${
                          i.checked ? 'bg-like border-like text-bg-base' : 'border-line-strong'
                        }`}
                      >
                        {i.checked ? '✓' : ''}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={i.checked ? 'line-through text-ink-faint' : 'text-ink'}>
                          <span className="truncate">{i.name}</span>
                          {(i.quantity != null || i.unit) && (
                            <span className="text-ink-dim text-sm ml-2">{formatQty(i.quantity, i.unit)}</span>
                          )}
                        </div>
                        {i.recipes && i.recipes.length > 0 && (
                          <div className="text-[11px] text-ink-faint truncate" title={i.recipes.map((r) => r.name).join(', ')}>
                            {i.recipes.map((r) => `${r.emoji} ${r.name}`).join(' · ')}
                          </div>
                        )}
                      </div>
                      {i.source === 'manual' && (
                        <button onClick={() => onRemove(i.id)} className="text-ink-faint hover:text-skip px-1.5 shrink-0">✕</button>
                      )}
                    </div>
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
