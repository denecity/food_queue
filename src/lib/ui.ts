import type { Health, Perishability, Recipe } from './types'

// --- Rating scales -----------------------------------------------------------

export const HEALTH_OPTIONS: { value: Health; label: string; emoji: string; color: string }[] = [
  { value: 'shit', label: 'Junk', emoji: '🗑️', color: '#ef4444' },
  { value: 'bad', label: 'Bad', emoji: '😬', color: '#f97316' },
  { value: 'mid', label: 'Mid', emoji: '😐', color: '#eab308' },
  { value: 'good', label: 'Good', emoji: '🥗', color: '#4ade80' },
  { value: 'soul', label: 'Soul food', emoji: '💚', color: '#22d3ee' },
]

export const PERISH_OPTIONS: { value: Perishability; label: string; color: string }[] = [
  { value: 'high', label: 'Perishable', color: '#f87171' },
  { value: 'mid', label: 'Semi', color: '#fbbf24' },
  { value: 'low', label: 'Shelf-stable', color: '#4ade80' },
]

export const EFFORT_LABELS = ['Trivial', 'Easy', 'Medium', 'Involved', 'Project']

export function healthMeta(h: Health) {
  return HEALTH_OPTIONS.find((o) => o.value === h) ?? HEALTH_OPTIONS[2]
}
export function perishMeta(p: Perishability) {
  return PERISH_OPTIONS.find((o) => o.value === p) ?? PERISH_OPTIONS[1]
}
export function effortLabel(e: number) {
  return EFFORT_LABELS[Math.max(0, Math.min(4, e))]
}

// --- Tags --------------------------------------------------------------------

export const CORE_TAGS = ['cold weather', 'hot weather', 'quick', 'high effort']
export const CUISINE_TAGS = ['korean', 'japanese', 'italian', 'mexican', 'indian', 'thai', 'german', 'mediterranean']

// --- Grocery aisles ----------------------------------------------------------

export const CATEGORY_ORDER = ['produce', 'protein', 'dairy', 'pantry', 'spice', 'other']
export const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  produce: { label: 'Produce', emoji: '🥬' },
  protein: { label: 'Protein', emoji: '🍗' },
  dairy: { label: 'Dairy & Eggs', emoji: '🧀' },
  pantry: { label: 'Pantry', emoji: '🥫' },
  spice: { label: 'Spices', emoji: '🧂' },
  other: { label: 'Other', emoji: '🛒' },
}
export function categoryMeta(c: string | null) {
  return CATEGORY_META[c ?? 'other'] ?? CATEGORY_META.other
}

// --- Images & visuals --------------------------------------------------------

/**
 * Resolve a recipe's photo. `image_key` holds EITHER a pasted http(s) URL
 * (no-R2 mode) OR an R2 object key (served via /api/images, cache-busted by
 * updated_at). Returns null if there's no photo.
 */
export function recipeImageUrl(r: { image_key: string | null; updated_at?: string }): string | null {
  if (!r.image_key) return null
  if (/^https?:\/\//i.test(r.image_key)) return r.image_key
  const v = r.updated_at ? `?v=${encodeURIComponent(r.updated_at)}` : ''
  return `/api/images/${r.image_key}${v}`
}

const GRADIENTS = [
  ['#7f1d1d', '#b45309'], ['#1e3a5f', '#0f766e'], ['#4c1d95', '#9d174d'],
  ['#713f12', '#854d0e'], ['#064e3b', '#065f46'], ['#831843', '#9a3412'],
  ['#1e293b', '#334155'], ['#7c2d12', '#b91c1c'],
]
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
/** Deterministic gradient for the emoji-fallback card background. */
export function recipeGradient(r: Pick<Recipe, 'id' | 'name'>): string {
  const [a, b] = GRADIENTS[hash(r.id || r.name) % GRADIENTS.length]
  return `linear-gradient(135deg, ${a}, ${b})`
}

// --- Misc --------------------------------------------------------------------

export function formatQty(q: number | null, unit: string | null): string {
  if (q == null) return unit ?? ''
  const n = Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100)
  return unit ? `${n} ${unit}` : n
}

export function relativeDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso.replace(' ', 'T'))
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (Number.isNaN(days)) return null
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
