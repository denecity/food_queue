import type { GroceryItem, PlanItem, Recipe, RecipeDraft } from './types'

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
    patch(id: string, body: Partial<Pick<PlanItem, 'cooked' | 'joker' | 'position' | 'planned_servings'>>) {
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

  generate(prompt: string) {
    return request<RecipeDraft & { source: 'ai' }>('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    })
  },
}
