import type { PlanItem, Recipe } from '../lib/types'
import { perishMeta, recipeGradient, recipeImageUrl, relativeDate } from '../lib/ui'

function Thumb({ recipe }: { recipe: Recipe }) {
  const img = recipeImageUrl(recipe)
  return (
    <div className="w-14 h-14 rounded-lg overflow-hidden flex items-center justify-center shrink-0"
      style={img ? undefined : { background: recipeGradient(recipe) }}>
      {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl">{recipe.emoji}</span>}
    </div>
  )
}

export function CookScreen({
  cook,
  onPatch,
  onTap,
}: {
  cook: PlanItem[]
  onPatch: (id: string, body: { cooked?: boolean; joker?: boolean }) => void
  onTap: (recipe: Recipe) => void
}) {
  const done = cook.filter((c) => c.cooked).length

  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Cooking this week</h1>
        <span className="text-sm text-ink-dim">{done}/{cook.length} cooked</span>
      </div>

      {cook.length === 0 ? (
        <div className="text-center py-16 text-ink-dim space-y-1">
          <div className="text-4xl">🍳</div>
          <p>Nothing to cook yet. Pick dishes, shop, then hit <b>Begin week</b>.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-faint -mt-1">Ordered "eat first" — cook the most perishable dishes earliest. 🃏 = joker (out-of-order).</p>
          <div className="space-y-2">
            {cook.map((c) => {
              const pm = perishMeta(c.recipe.perishability)
              return (
                <div key={c.id} className={`card p-3 flex items-center gap-3 ${c.cooked ? 'opacity-55' : ''}`}>
                  <button
                    onClick={() => onPatch(c.id, { cooked: !c.cooked })}
                    className={`w-7 h-7 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      c.cooked ? 'bg-like border-like text-bg-base' : 'border-line-strong'
                    }`}
                  >
                    {c.cooked ? '✓' : ''}
                  </button>
                  <button onClick={() => onTap(c.recipe)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <Thumb recipe={c.recipe} />
                    <div className="min-w-0">
                      <div className={`font-semibold truncate ${c.cooked ? 'line-through text-ink-dim' : 'text-ink'}`}>
                        {c.recipe.name}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-ink-dim">
                        <span style={{ color: pm.color }}>● {pm.label}</span>
                        <span>⚡ {c.recipe.effort}</span>
                        {c.recipe.last_cooked && <span>· last {relativeDate(c.recipe.last_cooked)}</span>}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => onPatch(c.id, { joker: !c.joker })}
                    className={`shrink-0 text-xl px-1 ${c.joker ? '' : 'opacity-30 grayscale'}`}
                    title="Joker — eat out of perishability order"
                  >
                    🃏
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
