import { useEffect } from 'react'
import { useRecipes } from '../hooks/useRecipes'
import type { Recipe, RecipeSort } from '../lib/types'
import { perishMeta, recipeGradient, recipeImageUrl } from '../lib/ui'

const SORTS: { value: RecipeSort; label: string }[] = [
  { value: 'yumminess_desc', label: 'Yummiest' },
  { value: 'effort_asc', label: 'Easiest' },
  { value: 'cooked_desc', label: 'Most cooked' },
  { value: 'name_asc', label: 'A–Z' },
  { value: 'created_desc', label: 'Newest' },
]

export function RecipesScreen({
  pickIds,
  onTap,
  onNew,
  onAddPick,
  registerRefetch,
}: {
  pickIds: Set<string>
  onTap: (recipe: Recipe) => void
  onNew: () => void
  onAddPick: (id: string) => void
  registerRefetch: (fn: () => void) => void
}) {
  const { recipes, loading, search, setSearch, tag, setTag, sort, setSort, allTags, refetch } = useRecipes()
  useEffect(() => registerRefetch(refetch), [registerRefetch, refetch])

  return (
    <div className="px-4 pt-4 space-y-3 relative min-h-[60vh]">
      <input className="field" placeholder="Search recipes…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="flex items-center gap-2">
        <select className="field !py-2 flex-1" value={sort} onChange={(e) => setSort(e.target.value as RecipeSort)}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="field !py-2 flex-1" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-ink-dim">Loading…</div>
      ) : recipes.length === 0 ? (
        <div className="text-center py-16 text-ink-dim">No recipes found.</div>
      ) : (
        <div className="space-y-2">
          {recipes.map((r) => {
            const img = recipeImageUrl(r)
            const pm = perishMeta(r.perishability)
            const inPlan = pickIds.has(r.id)
            return (
              <div key={r.id} className="card card-hover p-2.5 flex items-center gap-3">
                <button onClick={() => onTap(r)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center shrink-0"
                    style={img ? undefined : { background: recipeGradient(r) }}>
                    {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl">{r.emoji}</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-ink truncate">{r.name}</div>
                    <div className="flex items-center gap-2 text-xs text-ink-dim">
                      <span>★ {r.yumminess}</span>
                      <span>⚡ {r.effort}</span>
                      <span style={{ color: pm.color }}>● {pm.label}</span>
                      {r.times_cooked > 0 && <span>· cooked {r.times_cooked}×</span>}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => onAddPick(r.id)}
                  disabled={inPlan}
                  className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-lg ${
                    inPlan ? 'text-like' : 'text-ink-dim bg-bg-elevated active:scale-95'
                  }`}
                  title={inPlan ? 'In plan' : 'Add to picks'}
                >
                  {inPlan ? '✓' : '+'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <button
        onClick={onNew}
        className="fixed right-4 z-30 btn-primary !rounded-full !px-5 !py-3.5 shadow-deck"
        style={{ bottom: 'calc(var(--nav-h) + var(--safe-bottom) + 16px)' }}
      >
        ✨ New
      </button>
    </div>
  )
}
