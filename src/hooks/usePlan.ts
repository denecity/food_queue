import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { PlanItem } from '../lib/types'
import { toast } from '../lib/toast'

export function usePlan() {
  const [picks, setPicks] = useState<PlanItem[]>([])
  const [cook, setCook] = useState<PlanItem[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api.plan.pick(), api.plan.cook()])
      setPicks(p)
      setCook(c)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load plan', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const addPick = useCallback(async (recipeId: string) => {
    const res = await api.plan.add(recipeId)
    await refetch()
    return res
  }, [refetch])

  const removeItem = useCallback(async (id: string) => {
    setPicks((p) => p.filter((i) => i.id !== id))
    setCook((c) => c.filter((i) => i.id !== id))
    try {
      await api.plan.remove(id)
    } finally {
      refetch()
    }
  }, [refetch])

  const patchItem = useCallback(async (id: string, body: Partial<Pick<PlanItem, 'cooked' | 'joker' | 'planned_servings'>>) => {
    setCook((c) => c.map((i) => (i.id === id ? { ...i, ...body } : i)))
    setPicks((p) => p.map((i) => (i.id === id ? { ...i, ...body } : i)))
    try {
      await api.plan.patch(id, body)
    } finally {
      refetch()
    }
  }, [refetch])

  const beginWeek = useCallback(async () => {
    const res = await api.plan.beginWeek()
    await refetch()
    return res
  }, [refetch])

  const clearPicks = useCallback(async () => {
    await api.plan.clear()
    await refetch()
  }, [refetch])

  const pickIds = new Set([...picks, ...cook].map((i) => i.recipe.id))

  return { picks, cook, loading, pickIds, addPick, removeItem, patchItem, beginWeek, clearPicks, refetch }
}
