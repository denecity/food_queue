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
  sort_order: number
  created_at: string
}

export type Tab = 'swipe' | 'plan' | 'shop' | 'cook' | 'recipes'

export type RecipeSort =
  | 'yumminess_desc' | 'yumminess_asc'
  | 'effort_asc' | 'effort_desc'
  | 'name_asc' | 'created_desc' | 'cooked_desc'
