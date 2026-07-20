import type { Env } from '../_lib/types'
import { json } from '../_lib/http'
import { GENERATE_MODELS, defaultModel } from '../_lib/models'

// GET /api/models  — the models available for AI recipe generation + the default.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return json({ models: GENERATE_MODELS, default: defaultModel(env) })
}
