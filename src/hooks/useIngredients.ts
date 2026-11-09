import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { RegisterIngredient } from '../lib/types'
import { toast } from '../lib/toast'

/** The ingredient register (master list) + edits to a canonical entry. */
export function useIngredients() {
  const [items, setItems] = useState<RegisterIngredient[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (withSpinner: boolean) => {
    if (withSpinner) setLoading(true)
    try {
      setItems(await api.ingredients.list())
    } catch (e) {
      if (withSpinner) toast(e instanceof Error ? e.message : 'Failed to load ingredients', 'error')
    } finally {
      if (withSpinner) setLoading(false)
    }
  }, [])

  useEffect(() => { load(true) }, [load])

  const create = useCallback(
    async (body: { name: string; unit?: string | null; category?: string | null; staple?: boolean }) => {
      try {
        await api.ingredients.create(body)
        load(false)
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not add ingredient', 'error')
      }
    },
    [load]
  )

  const patch = useCallback(
    async (id: string, body: { default_unit?: string | null; step?: number | null; category?: string | null; staple?: boolean }) => {
      setItems((xs) => xs.map((i) => (i.id === id ? { ...i, ...body } as RegisterIngredient : i)))
      try {
        await api.ingredients.patch(id, body)
      } catch {
        load(false)
      }
    },
    [load]
  )

  return { items, loading, create, patch, refetch: () => load(false) }
}
