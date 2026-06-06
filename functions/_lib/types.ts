/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database
  IMAGES: R2Bucket
  ANTHROPIC_API_KEY?: string
  GENERATE_MODEL?: string
  GENERATE_SECRET?: string
}

export type Perishability = 'high' | 'mid' | 'low'
export type Health = 'shit' | 'bad' | 'mid' | 'good' | 'soul'

export interface Ingredient {
  id: string
  recipe_id: string
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
  note: string | null
  sort_order: number
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
