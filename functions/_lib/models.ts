import type { Env } from './types'

export interface ModelOption {
  id: string
  label: string
  hint: string
}

// Curated set the user can pick from for AI recipe generation. Single source of
// truth: the /api/models endpoint serves this list and /api/generate validates
// the requested model against it.
export const GENERATE_MODELS: ModelOption[] = [
  { id: 'claude-opus-4-8', label: 'Opus 4.8', hint: 'Most capable · default' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', hint: 'Balanced speed & quality' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', hint: 'Fastest & cheapest' },
]

export const DEFAULT_MODEL = 'claude-opus-4-8'

export function isValidModel(id: unknown): id is string {
  return typeof id === 'string' && GENERATE_MODELS.some((m) => m.id === id)
}

/** The model pre-selected in the UI: the env override if it's a known model, else the default. */
export function defaultModel(env: Env): string {
  return isValidModel(env.GENERATE_MODEL) ? env.GENERATE_MODEL : DEFAULT_MODEL
}

/** Pick the model to call: the user's choice if valid, else the env/app default. */
export function resolveModel(requested: unknown, env: Env): string {
  if (isValidModel(requested)) return requested
  return defaultModel(env)
}
