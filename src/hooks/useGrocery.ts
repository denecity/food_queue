import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { GroceryItem } from '../lib/types'
import { toast } from '../lib/toast'

export function useGrocery() {
  const [items, setItems] = useState<GroceryItem[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      setItems(await api.grocery.list())
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load list', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const toggle = useCallback(async (id: string, checked: boolean) => {
    setItems((xs) => xs.map((i) => (i.id === id ? { ...i, checked } : i)))
    try {
      await api.grocery.patch(id, { checked })
    } catch {
      refetch()
    }
  }, [refetch])

  const add = useCallback(async (body: { name: string; quantity?: number | null; unit?: string | null; category?: string | null }) => {
    const created = await api.grocery.add(body)
    setItems((xs) => [...xs, created])
  }, [])

  const remove = useCallback(async (id: string) => {
    setItems((xs) => xs.filter((i) => i.id !== id))
    try {
      await api.grocery.remove(id)
    } catch {
      refetch()
    }
  }, [refetch])

  const build = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await api.grocery.build())
      toast('Shopping list rebuilt from picks', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Build failed', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const clearChecked = useCallback(async () => {
    await api.grocery.clearChecked()
    refetch()
  }, [refetch])

  return { items, loading, toggle, add, remove, build, clearChecked, refetch }
}
