import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Recipe, RecipeSort } from '../lib/types'
import { toast } from '../lib/toast'

export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState<RecipeSort>('yumminess_desc')

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      setRecipes(await api.recipes.list({ search, tag, sort }))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load recipes', 'error')
    } finally {
      setLoading(false)
    }
  }, [search, tag, sort])

  useEffect(() => {
    const t = setTimeout(refetch, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [refetch, search])

  const allTags = Array.from(new Set(recipes.flatMap((r) => r.tags))).sort()

  return { recipes, loading, search, setSearch, tag, setTag, sort, setSort, allTags, refetch }
}
