export type Perishability = 'high' | 'mid' | 'low'
export type Health = 'shit' | 'bad' | 'mid' | 'good' | 'soul'
export type Stage = 'pick' | 'cook'
export type IngredientCategory =
  | 'produce' | 'dairy' | 'protein' | 'pantry' | 'spice' | 'other'

export interface Ingredient {
  id?: string
  recipe_id?: string
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
  note: string | null
  sort_order?: number
}

export interface Recipe {
  id: string
  name: string
  emoji: string
  image_key: string | null
  description: string | null
  cuisine: string | null
  servings: number
  effort: number
  perishability: Perishability
  health: Health
  yumminess: number
  prep_minutes: number | null
  cook_minutes: number | null
  instructions: string | null
  notes: string | null
  tags: string[]
  source: 'manual' | 'ai'
  archived: boolean
  times_cooked: number
  last_cooked: string | null
  created_at: string
  updated_at: string
  ingredients?: Ingredient[]
}

/** Editable draft for create / edit / AI-generate (id absent until saved). */
export type RecipeDraft = Partial<Omit<Recipe, 'id' | 'created_at' | 'updated_at'>> & {
  name: string
  ingredients: Ingredient[]
}

export interface PlanItem {
  id: string
  stage: Stage
  position: number
  planned_servings: number
  cooked: boolean
  joker: boolean
  added_at: string
  recipe: Recipe
}

export interface GroceryItem {
  id: string
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
  checked: boolean
  source: 'plan' | 'manual'
  recipe_ids: string[]
  recipes?: { id: string; name: string; emoji: string }[]
  sort_order: number
  created_at: string
}

export type StockLocation = 'fridge' | 'freezer' | 'pantry' | 'spice'

export interface StockItem {
  id: string
  ingredient_id: string
  ingredient: string
  category: string | null
  quantity: number | null
  unit: string | null
  canonical_unit: string | null
  step: number
  location: StockLocation
  expires_on: string | null
  opened_on: string | null
  staple: boolean
  source: string
  added_at: string
}

export type UsageStatus = 'ok' | 'not_in_stock' | 'no_amount' | 'unit_mismatch'

export interface UsageLine {
  ingredient_id: string | null
  ingredient: string
  unit: string | null
  step: number
  needed: number | null
  on_hand: number
  after: number
  status: UsageStatus
}

export interface RecipeUsage {
  recipe: { id: string; name: string; servings: number }
  servings: number
  lines: UsageLine[]
}

export interface ConsumePayload {
  consume?: { ingredient_id: string; amount: number }[]
  add?: { ingredient: string; quantity?: number | null; unit?: string | null; location?: string | null }[]
}

export interface ModelOption {
  id: string
  label: string
  hint: string
}

export type Tab = 'swipe' | 'plan' | 'shop' | 'cook' | 'stock' | 'recipes'

export type RecipeSort =
  | 'yumminess_desc' | 'yumminess_asc'
  | 'effort_asc' | 'effort_desc'
  | 'name_asc' | 'created_desc' | 'cooked_desc'
