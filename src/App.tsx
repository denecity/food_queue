import { useEffect, useRef, useState } from 'react'
import type { ConsumePayload, PlanItem, Recipe, RecipeUsage, Tab } from './lib/types'
import { api } from './lib/api'
import { toast, ToastContainer } from './lib/toast'
import { usePlan } from './hooks/usePlan'
import { useGrocery } from './hooks/useGrocery'
import { useStock } from './hooks/useStock'
import { useCookability } from './hooks/useCookability'
import { useIngredients } from './hooks/useIngredients'
import { BottomNav } from './components/BottomNav'
import { RecipeEditor } from './components/RecipeEditor'
import { SwipeScreen } from './screens/SwipeScreen'
import { PlanScreen } from './screens/PlanScreen'
import { ShopScreen } from './screens/ShopScreen'
import { CookScreen } from './screens/CookScreen'
import { StockScreen } from './screens/StockScreen'
import { IngredientsScreen } from './screens/IngredientsScreen'
import { RecipesScreen } from './screens/RecipesScreen'
import { ReconcileSheet } from './components/ReconcileSheet'
import { daysUntil, EXPIRING_SOON_DAYS } from './lib/ui'

export default function App() {
  const [tab, setTab] = useState<Tab>('swipe')
  const [editor, setEditor] = useState<{ open: boolean; recipe: Recipe | null }>({ open: false, recipe: null })
  const [reconcile, setReconcile] = useState<{ item: PlanItem; usage: RecipeUsage | null; loading: boolean; busy: boolean } | null>(null)
  const recipesRefetch = useRef<(() => void) | null>(null)

  const plan = usePlan()
  const grocery = useGrocery()
  const stock = useStock()
  const cookability = useCookability()
  const ingredients = useIngredients()

  // Keep the "% in stock" badges fresh when landing on the tabs that show them.
  useEffect(() => {
    if (tab === 'swipe' || tab === 'recipes') cookability.refetch()
  }, [tab, cookability.refetch])

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
    if (!confirm('Done shopping? This moves all remaining picks into Cook and clears the shopping list.')) return
    const res = await plan.beginWeek()
    grocery.refetch()
    toast(`Week started — ${res.cooking} dishes to cook 🍳`, 'success')
    setTab('cook')
  }

  async function promote(id: string) {
    await plan.promoteItem(id)
    toast('Moved to Cook 🍳', 'success')
  }

  // Marking a dish cooked opens the stock-reconciliation sheet first.
  async function startCook(item: PlanItem) {
    setReconcile({ item, usage: null, loading: true, busy: false })
    try {
      const usage = await api.stock.usage(item.recipe.id, item.planned_servings)
      setReconcile((r) => (r && r.item.id === item.id ? { ...r, usage, loading: false } : r))
    } catch {
      // Couldn't compute usage — fall back to just marking it cooked.
      setReconcile(null)
      plan.patchItem(item.id, { cooked: true })
    }
  }

  async function confirmCook(payload: ConsumePayload) {
    if (!reconcile) return
    const { item } = reconcile
    setReconcile((r) => (r ? { ...r, busy: true } : r))
    try {
      if ((payload.consume?.length ?? 0) > 0 || (payload.add?.length ?? 0) > 0) await stock.consume(payload)
      await plan.patchItem(item.id, { cooked: true })
      cookability.refetch()
      toast('Cooked 🍳 — stock updated', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not finish', 'error')
    } finally {
      setReconcile(null)
    }
  }

  const badges = {
    plan: plan.picks.length,
    shop: grocery.items.filter((i) => !i.checked && !i.have).length,
    cook: plan.cook.filter((c) => !c.cooked).length,
    stock: stock.items.filter((i) => {
      const d = daysUntil(i.expires_on)
      return d != null && d <= EXPIRING_SOON_DAYS
    }).length,
  }

  return (
    <div className="min-h-screen bg-bg-base text-ink">
      <main className="max-w-2xl mx-auto" style={{ paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) + 24px)' }}>
        {tab === 'swipe' && (
          <SwipeScreen pickIds={plan.pickIds} cookability={cookability.map} onPick={addPick} onTap={openEdit} />
        )}
        {tab === 'plan' && (
          <PlanScreen
            picks={plan.picks}
            grocery={grocery.items}
            onRemove={plan.removeItem}
            onPromote={promote}
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
            onSync={grocery.sync}
          />
        )}
        {tab === 'cook' && (
          <CookScreen cook={plan.cook} onPatch={plan.patchItem} onCook={startCook} onTap={openEdit} />
        )}
        {tab === 'stock' && (
          <StockScreen
            items={stock.items}
            loading={stock.loading}
            onAdd={stock.add}
            onPatch={stock.patch}
            onIncrement={stock.increment}
            onEditIngredient={stock.editIngredient}
            onRemove={stock.remove}
          />
        )}
        {tab === 'items' && (
          <IngredientsScreen items={ingredients.items} loading={ingredients.loading} onPatch={ingredients.patch} onCreate={ingredients.create} />
        )}
        {tab === 'recipes' && (
          <RecipesScreen
            pickIds={plan.pickIds}
            cookability={cookability.map}
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

      {reconcile && (
        <ReconcileSheet
          usage={reconcile.usage}
          loading={reconcile.loading}
          busy={reconcile.busy}
          onCancel={() => setReconcile(null)}
          onConfirm={confirmCook}
        />
      )}

      <ToastContainer />
    </div>
  )
}
