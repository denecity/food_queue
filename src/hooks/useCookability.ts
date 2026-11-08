import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export type Cookability = Record<string, { have: number; total: number }>

/** How much of each recipe's ingredients are already in stock (by recipe id). */
export function useCookability() {
  const [map, setMap] = useState<Cookability>({})

  const refetch = useCallback(async () => {
    try {
      setMap(await api.recipes.cookability())
    } catch {
      /* non-critical: the badge just won't show */
    }
  }, [])

  useEffect(() => { refetch() }, [refetch])

  return { map, refetch }
}
