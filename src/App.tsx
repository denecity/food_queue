import { useRef, useState } from 'react'
import type { Recipe, Tab } from './lib/types'
import { api } from './lib/api'
import { toast, ToastContainer } from './lib/toast'
import { usePlan } from './hooks/usePlan'
import { useGrocery } from './hooks/useGrocery'
import { BottomNav } from './components/BottomNav'
import { RecipeEditor } from './components/RecipeEditor'
import { SwipeScreen } from './screens/SwipeScreen'
import { PlanScreen } from './screens/PlanScreen'
import { ShopScreen } from './screens/ShopScreen'
import { CookScreen } from './screens/CookScreen'
import { RecipesScreen } from './screens/RecipesScreen'

export default function App() {
  const [tab, setTab] = useState<Tab>('swipe')
  const [editor, setEditor] = useState<{ open: boolean; recipe: Recipe | null }>({ open: false, recipe: null })
  const recipesRefetch = useRef<(() => void) | null>(null)

  const plan = usePlan()
  const grocery = useGrocery()

  function openNew() {
    setEditor({ open: true, recipe: null })
  }

  async function openEdit(summary: Recipe) {
    try {
      const full = await api.recipes.get(summary.id)
      setEditor({ open: true, recipe: full })
    } catch {
      setEditor({ open: true, recipe: summary })
    }
  }

  function afterSave() {
    recipesRefetch.current?.()
    plan.refetch()
  }

  async function addPick(recipeId: string) {
    const res = await plan.addPick(recipeId)
    if (res?.alreadyInPlan) toast('Already in your plan', 'info')
    return res
  }

  async function buildList() {
    await grocery.build()
    setTab('shop')
  }

  async function beginWeek() {
    if (plan.picks.length === 0) {
      toast('No picks to start the week with', 'info')
      return
    }
    if (!confirm('Done shopping? This moves your picks into Cook and clears the shopping list.')) return
    const res = await plan.beginWeek()
    grocery.refetch()
    toast(`Week started — ${res.cooking} dishes to cook 🍳`, 'success')
    setTab('cook')
  }

  const badges = {
    plan: plan.picks.length,
    shop: grocery.items.filter((i) => !i.checked).length,
    cook: plan.cook.filter((c) => !c.cooked).length,
  }

  return (
    <div className="min-h-screen bg-bg-base text-ink">
      <main className="max-w-2xl mx-auto" style={{ paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) + 24px)' }}>
        {tab === 'swipe' && (
          <SwipeScreen pickIds={plan.pickIds} onPick={addPick} onTap={openEdit} />
        )}
        {tab === 'plan' && (
          <PlanScreen
            picks={plan.picks}
            onRemove={plan.removeItem}
            onTap={openEdit}
            onBuildList={buildList}
            onBeginWeek={beginWeek}
          />
        )}
        {tab === 'shop' && (
          <ShopScreen
            items={grocery.items}
            loading={grocery.loading}
            onToggle={grocery.toggle}
            onAdd={(name) => grocery.add({ name })}
            onRemove={grocery.remove}
            onBuild={grocery.build}
            onClearChecked={grocery.clearChecked}
          />
        )}
        {tab === 'cook' && (
          <CookScreen cook={plan.cook} onPatch={plan.patchItem} onTap={openEdit} />
        )}
        {tab === 'recipes' && (
          <RecipesScreen
            pickIds={plan.pickIds}
            onTap={openEdit}
            onNew={openNew}
            onAddPick={addPick}
            registerRefetch={(fn) => { recipesRefetch.current = fn }}
          />
        )}
      </main>

      <BottomNav active={tab} onChange={setTab} badges={badges} />

      {editor.open && (
        <RecipeEditor
          recipe={editor.recipe}
          onClose={() => setEditor({ open: false, recipe: null })}
          onSaved={afterSave}
          onDeleted={() => { afterSave() }}
        />
      )}

      <ToastContainer />
    </div>
  )
}
