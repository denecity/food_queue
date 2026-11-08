import type { ConsumePayload, GroceryItem, ModelOption, PlanItem, Recipe, RecipeDraft, RecipeUsage, Stage, StockItem } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
    ...init,
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const data = await res.json()
      if (data?.error) msg = data.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json() as Promise<T>
  return undefined as T
}

export const api = {
  recipes: {
    list(params?: { search?: string; tag?: string; sort?: string; archived?: string }) {
      const qs = new URLSearchParams(
        Object.entries(params ?? {}).filter(([, v]) => v != null && v !== '') as [string, string][]
      ).toString()
      return request<Recipe[]>(`/api/recipes${qs ? `?${qs}` : ''}`)
    },
    get(id: string) {
      return request<Recipe>(`/api/recipes/${id}`)
    },
    create(body: RecipeDraft) {
      return request<Recipe>('/api/recipes', { method: 'POST', body: JSON.stringify(body) })
    },
    update(id: string, body: Partial<RecipeDraft>) {
      return request<Recipe>(`/api/recipes/${id}`, { method: 'PUT', body: JSON.stringify(body) })
    },
    remove(id: string) {
      return request<void>(`/api/recipes/${id}`, { method: 'DELETE' })
    },
    markCooked(id: string) {
      return request<Recipe>(`/api/recipes/${id}/cooked`, { method: 'POST' })
    },
    cookability() {
      return request<Record<string, { have: number; total: number }>>('/api/cookability')
    },
    async uploadImage(id: string, file: File) {
      return request<{ image_key: string; updated_at: string }>(`/api/recipes/${id}/image`, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file,
      })
    },
    removeImage(id: string) {
      return request<{ ok: boolean }>(`/api/recipes/${id}/image`, { method: 'DELETE' })
    },
  },

  plan: {
    pick() {
      return request<PlanItem[]>('/api/plan?stage=pick')
    },
    cook() {
      return request<PlanItem[]>('/api/plan?stage=cook')
    },
    add(recipeId: string) {
      return request<{ id: string; stage: string; alreadyInPlan: boolean }>('/api/plan', {
        method: 'POST',
        body: JSON.stringify({ recipe_id: recipeId }),
      })
    },
    patch(id: string, body: Partial<Pick<PlanItem, 'cooked' | 'joker' | 'position' | 'planned_servings'>> & { stage?: Stage }) {
      return request<{ ok: boolean }>(`/api/plan/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    },
    remove(id: string) {
      return request<void>(`/api/plan/${id}`, { method: 'DELETE' })
    },
    clear() {
      return request<{ ok: boolean }>('/api/plan/clear', { method: 'POST' })
    },
    beginWeek() {
      return request<{ ok: boolean; cooking: number }>('/api/plan/begin-week', { method: 'POST' })
    },
  },

  grocery: {
    list() {
      return request<GroceryItem[]>('/api/grocery')
    },
    add(body: { name: string; quantity?: number | null; unit?: string | null; category?: string | null }) {
      return request<GroceryItem>('/api/grocery', { method: 'POST', body: JSON.stringify(body) })
    },
    patch(id: string, body: Partial<Pick<GroceryItem, 'checked' | 'name' | 'quantity' | 'unit' | 'category'>>) {
      return request<{ ok: boolean }>(`/api/grocery/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    },
    remove(id: string) {
      return request<void>(`/api/grocery/${id}`, { method: 'DELETE' })
    },
    build() {
      return request<GroceryItem[]>('/api/grocery/build', { method: 'POST' })
    },
    clearChecked() {
      return request<{ ok: boolean }>('/api/grocery/clear-checked', { method: 'POST' })
    },
  },

  stock: {
    list() {
      return request<StockItem[]>('/api/stock')
    },
    add(body: {
      ingredient: string
      quantity?: number | null
      unit?: string | null
      location?: string | null
      expires_on?: string | null
      store?: string | null
      price?: number | null
    }) {
      return request<StockItem>('/api/stock', { method: 'POST', body: JSON.stringify(body) })
    },
    patch(id: string, body: Partial<Pick<StockItem, 'quantity' | 'unit' | 'location' | 'expires_on' | 'opened_on'>>) {
      return request<StockItem>(`/api/stock/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    },
    remove(id: string) {
      return request<void>(`/api/stock/${id}`, { method: 'DELETE' })
    },
    usage(recipeId: string, servings?: number) {
      const qs = new URLSearchParams({ recipe_id: recipeId, ...(servings ? { servings: String(servings) } : {}) }).toString()
      return request<RecipeUsage>(`/api/stock/usage?${qs}`)
    },
    consume(body: ConsumePayload) {
      return request<StockItem[]>('/api/stock/consume', { method: 'POST', body: JSON.stringify(body) })
    },
  },

  ingredients: {
    patch(id: string, body: { default_unit?: string | null; step?: number | null; category?: string | null; default_location?: string | null; staple?: boolean }) {
      return request<unknown>(`/api/ingredients/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    },
  },

  generate(prompt: string, current?: Partial<RecipeDraft>, model?: string) {
    return request<RecipeDraft & { source: 'ai' }>('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, current, model }),
    })
  },

  models() {
    return request<{ models: ModelOption[]; default: string }>('/api/models')
  },
}
