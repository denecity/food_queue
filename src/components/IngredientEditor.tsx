import type { Ingredient } from '../lib/types'
import { CATEGORY_ORDER, categoryMeta } from '../lib/ui'

export function IngredientEditor({
  ingredients,
  onChange,
}: {
  ingredients: Ingredient[]
  onChange: (next: Ingredient[]) => void
}) {
  function update(i: number, patch: Partial<Ingredient>) {
    onChange(ingredients.map((ing, idx) => (idx === i ? { ...ing, ...patch } : ing)))
  }
  function remove(i: number) {
    onChange(ingredients.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...ingredients, { name: '', quantity: null, unit: null, category: 'other', note: null }])
  }

  return (
    <div className="space-y-2">
      {ingredients.map((ing, i) => (
        <div key={i} className="flex gap-1.5 items-center">
          <input
            className="field !px-2 !py-2 w-16 text-center"
            placeholder="qty"
            inputMode="decimal"
            value={ing.quantity ?? ''}
            onChange={(e) => update(i, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <input
            className="field !px-2 !py-2 w-16"
            placeholder="unit"
            value={ing.unit ?? ''}
            onChange={(e) => update(i, { unit: e.target.value || null })}
          />
          <input
            className="field !px-2 !py-2 flex-1"
            placeholder="ingredient"
            value={ing.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <select
            className="field !px-1 !py-2 w-12 appearance-none text-center"
            value={ing.category ?? 'other'}
            onChange={(e) => update(i, { category: e.target.value })}
            title="Aisle"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{categoryMeta(c).emoji}</option>
            ))}
          </select>
          <button type="button" onClick={() => remove(i)} className="text-ink-dim hover:text-skip px-1.5 text-lg shrink-0">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="btn-line w-full !py-2 text-sm">+ Add ingredient</button>
    </div>
  )
}
