import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { GroceryItem } from '../lib/types'
import { toast } from '../lib/toast'

export function useGrocery() {
  const [items, setItems] = useState<GroceryItem[]>([])
  const [loading, setLoading] = useState(true)
  const pending = useRef(0) // # of in-flight local mutations; pauses sync from clobbering them

  const load = useCallback(async (withSpinner: boolean) => {
    if (withSpinner) setLoading(true)
    try {
      const data = await api.grocery.list()
      if (pending.current === 0) setItems(data)
    } catch (e) {
      if (withSpinner) toast(e instanceof Error ? e.message : 'Failed to load list', 'error')
    } finally {
      if (withSpinner) setLoading(false)
    }
  }, [])

  useEffect(() => { load(true) }, [load])

  /** Background sync for live multi-device updates — no spinner, skips while a local edit is in flight or tab hidden. */
  const sync = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    if (pending.current === 0) load(false)
  }, [load])

  const toggle = useCallback(async (id: string, checked: boolean) => {
    setItems((xs) => xs.map((i) => (i.id === id ? { ...i, checked } : i)))
    pending.current++
    try { await api.grocery.patch(id, { checked }) } catch { load(false) } finally { pending.current-- }
  }, [load])

  const add = useCallback(async (body: { name: string; quantity?: number | null; unit?: string | null; category?: string | null }) => {
    pending.current++
    try {
      const created = await api.grocery.add(body)
      setItems((xs) => [...xs, created])
    } finally { pending.current-- }
  }, [])

  const remove = useCallback(async (id: string) => {
    setItems((xs) => xs.filter((i) => i.id !== id))
    pending.current++
    try { await api.grocery.remove(id) } catch { load(false) } finally { pending.current-- }
  }, [load])

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
    load(false)
  }, [load])

  return { items, loading, toggle, add, remove, build, clearChecked, refetch: () => load(false), sync }
}
