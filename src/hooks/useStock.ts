import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { ConsumePayload, StockItem } from '../lib/types'
import { toast } from '../lib/toast'

const round = (n: number) => Math.round(n * 1000) / 1000

export function useStock() {
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const pending = useRef(0) // in-flight local mutations; pauses background loads clobbering them

  const load = useCallback(async (withSpinner: boolean) => {
    if (withSpinner) setLoading(true)
    try {
      const data = await api.stock.list()
      if (pending.current === 0) setItems(data)
    } catch (e) {
      if (withSpinner) toast(e instanceof Error ? e.message : 'Failed to load stock', 'error')
    } finally {
      if (withSpinner) setLoading(false)
    }
  }, [])

  useEffect(() => { load(true) }, [load])

  const add = useCallback(
    async (body: { ingredient: string; quantity?: number | null; unit?: string | null; location?: string | null; expires_on?: string | null }) => {
      pending.current++
      try {
        const created = await api.stock.add(body)
        setItems((xs) => [...xs, created])
        return created
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not add to stock', 'error')
      } finally {
        pending.current--
      }
    },
    []
  )

  const patch = useCallback(
    async (id: string, body: Partial<Pick<StockItem, 'quantity' | 'unit' | 'location' | 'expires_on' | 'opened_on'>>) => {
      setItems((xs) => xs.map((i) => (i.id === id ? ({ ...i, ...body } as StockItem) : i)))
      pending.current++
      try {
        const updated = await api.stock.patch(id, body)
        setItems((xs) => xs.map((i) => (i.id === id ? updated : i)))
      } catch {
        load(false)
      } finally {
        pending.current--
      }
    },
    [load]
  )

  const remove = useCallback(async (id: string) => {
    setItems((xs) => xs.filter((i) => i.id !== id))
    pending.current++
    try {
      await api.stock.remove(id)
    } catch {
      load(false)
    } finally {
      pending.current--
    }
  }, [load])

  /** Nudge a stock item by ±one step; hitting zero removes it. */
  const increment = useCallback(async (item: StockItem, dir: 1 | -1) => {
    const step = item.step > 0 ? item.step : 1
    const next = round((item.quantity ?? 0) + dir * step)
    if (next <= 0) return remove(item.id)
    return patch(item.id, { quantity: next })
  }, [patch, remove])

  /** Apply a cook reconciliation (subtractions + adds); returns the fresh list. */
  const consume = useCallback(async (payload: ConsumePayload) => {
    pending.current++
    try {
      const updated = await api.stock.consume(payload)
      setItems(updated)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update stock', 'error')
    } finally {
      pending.current--
    }
  }, [])

  /** Edit the register entry (canonical unit / step) behind an item; reloads to reflect everywhere. */
  const editIngredient = useCallback(
    async (ingredientId: string, body: { default_unit?: string | null; step?: number | null }) => {
      pending.current++
      try {
        await api.ingredients.patch(ingredientId, body)
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not update ingredient', 'error')
      } finally {
        pending.current--
      }
      load(false)
    },
    [load]
  )

  return { items, loading, add, patch, remove, increment, consume, editIngredient, refetch: () => load(false) }
}
