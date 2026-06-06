import type { PlanItem, Recipe } from '../lib/types'
import { perishMeta, recipeGradient, recipeImageUrl } from '../lib/ui'

function Thumb({ recipe }: { recipe: Recipe }) {
  const img = recipeImageUrl(recipe)
  return (
    <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center shrink-0"
      style={img ? undefined : { background: recipeGradient(recipe) }}>
      {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl">{recipe.emoji}</span>}
    </div>
  )
}

export function PlanScreen({
  picks,
  onRemove,
  onTap,
  onBuildList,
  onBeginWeek,
}: {
  picks: PlanItem[]
  onRemove: (id: string) => void
  onTap: (recipe: Recipe) => void
  onBuildList: () => void
  onBeginWeek: () => void
}) {
  const quick = picks.filter((p) => p.recipe.effort <= 1).length
  const mid = picks.filter((p) => p.recipe.effort === 2).length
  const involved = picks.filter((p) => p.recipe.effort >= 3).length

  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Picks for next shop</h1>
        <span className="text-sm text-ink-dim">{picks.length} dishes</span>
      </div>

      {picks.length === 0 ? (
        <div className="text-center py-16 text-ink-dim space-y-1">
          <div className="text-4xl">🍽️</div>
          <p>No picks yet. Head to <b>Swipe</b> to choose dishes.</p>
        </div>
      ) : (
        <>
          <div className="card p-3 flex items-center justify-around text-center text-sm">
            <div><div className="text-lg font-bold text-ink">{quick}</div><div className="text-ink-dim text-xs">quick</div></div>
            <div className="w-px h-8 bg-line" />
            <div><div className="text-lg font-bold text-ink">{mid}</div><div className="text-ink-dim text-xs">medium</div></div>
            <div className="w-px h-8 bg-line" />
            <div><div className="text-lg font-bold text-ink">{involved}</div><div className="text-ink-dim text-xs">involved</div></div>
          </div>
          <p className="text-xs text-ink-faint -mt-2">Ordered "eat first" by perishability. Aim ~50/50 quick &amp; medium effort.</p>

          <div className="space-y-2">
            {picks.map((p) => {
              const pm = perishMeta(p.recipe.perishability)
              return (
                <div key={p.id} className="card card-hover p-3 flex items-center gap-3">
                  <button onClick={() => onTap(p.recipe)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <Thumb recipe={p.recipe} />
                    <div className="min-w-0">
                      <div className="font-semibold text-ink truncate">{p.recipe.name}</div>
                      <div className="flex items-center gap-2 text-xs text-ink-dim">
                        <span style={{ color: pm.color }}>● {pm.label}</span>
                        <span>★ {p.recipe.yumminess}</span>
                        <span>⚡ {p.recipe.effort}</span>
                      </div>
                    </div>
                  </button>
                  <button onClick={() => onRemove(p.id)} className="text-ink-dim hover:text-skip px-2 text-lg shrink-0">✕</button>
                </div>
              )
            })}
          </div>

          <div className="space-y-2 pt-2">
            <button onClick={onBuildList} className="btn-ghost w-full">🛒 Build shopping list →</button>
            <button onClick={onBeginWeek} className="btn-primary w-full">✅ Begin week (shopping done)</button>
            <p className="text-xs text-ink-faint text-center px-4">
              "Begin week" moves these picks into <b>Cook</b>, clears the shopping list, and starts a fresh cycle.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
