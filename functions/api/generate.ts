import Anthropic from '@anthropic-ai/sdk'
import type { Env } from '../_lib/types'
import { json, readJson, badRequest } from '../_lib/http'
import { resolveModel } from '../_lib/models'

const SYSTEM = `You are a recipe assistant for a personal meal-planning app used by two people.
Given a short prompt, produce ONE complete recipe by calling the create_recipe tool.

House conventions:
- Default to 5 servings unless the prompt says otherwise.
- Ratings reflect THIS household's scales:
  - effort: 0 (trivial) to 4 (a real project)
  - perishability: "high" if it relies on fresh veg/fruit/herbs, "mid" for semi-perishables
    (cheese, bread, eggs), "low" for shelf-stable (pasta, rice, ramen, canned)
  - health: one of shit | bad | mid | good | soul ("soul" = deeply comforting soul food)
  - yumminess: 0..10, be honest and a bit opinionated
- tags: pick from cold weather, hot weather, quick, high effort, plus a cuisine
  (korean, japanese, italian, etc.) and any other useful short tags.
- Ingredients: give quantities scaled to the servings. category groups items for shopping
  and is one of: produce | bakery | dairy | protein | frozen | pantry | spice | asian | other.
  Use "asian" for items typically bought at an Asian/specialty store (gochujang, kimchi,
  miso, fish sauce, specific noodles, etc.) so they can be shopped in one trip.
- instructions: concise numbered steps, newline-separated.
- emoji: a single food emoji that represents the dish.

If a CURRENT recipe is provided, treat the request as an EDIT: keep everything the same
except what the change asks for, and return the full updated recipe (do not change the name
unless explicitly asked).`

const createRecipeTool: Anthropic.Tool = {
  name: 'create_recipe',
  description: 'Return a single structured recipe.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      emoji: { type: 'string', description: 'One food emoji' },
      description: { type: 'string', description: 'One enticing sentence' },
      cuisine: { type: 'string' },
      servings: { type: 'integer' },
      effort: { type: 'integer', description: '0..4' },
      perishability: { type: 'string', enum: ['high', 'mid', 'low'] },
      health: { type: 'string', enum: ['shit', 'bad', 'mid', 'good', 'soul'] },
      yumminess: { type: 'integer', description: '0..10' },
      prep_minutes: { type: 'integer' },
      cook_minutes: { type: 'integer' },
      tags: { type: 'array', items: { type: 'string' } },
      instructions: { type: 'string', description: 'Numbered steps, newline-separated' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity: { type: 'number' },
            unit: { type: 'string' },
            category: {
              type: 'string',
              enum: ['produce', 'bakery', 'dairy', 'protein', 'frozen', 'pantry', 'spice', 'asian', 'other'],
            },
            note: { type: 'string' },
          },
          required: ['name'],
        },
      },
    },
    required: ['name', 'emoji', 'effort', 'perishability', 'health', 'yumminess', 'tags', 'ingredients', 'instructions'],
  },
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Optional abuse guard: if GENERATE_SECRET is set, require a matching header.
  if (env.GENERATE_SECRET && request.headers.get('x-generate-secret') !== env.GENERATE_SECRET) {
    return json({ error: 'Forbidden' }, 403)
  }
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }, 500)
  }

  const body = await readJson<{ prompt?: string; current?: unknown; model?: string }>(request)
  const prompt = body.prompt?.trim()
  if (!prompt) return badRequest('prompt is required')

  const userContent = body.current
    ? `Here is the CURRENT recipe as JSON. Apply the change request and return the full updated recipe.\n\nCURRENT:\n${JSON.stringify(body.current)}\n\nCHANGE REQUEST: ${prompt}`
    : prompt

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  // Use the model the user picked (if it's one of the allowed options), else the app default.
  const model = resolveModel(body.model, env)

  try {
    const message = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM,
      tools: [createRecipeTool],
      tool_choice: { type: 'tool', name: 'create_recipe' },
      messages: [{ role: 'user', content: userContent }],
    })

    const block = message.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') {
      return json({ error: 'Model did not return a recipe.' }, 502)
    }

    const draft = block.input as Record<string, unknown>
    // Mark as AI-sourced; the frontend opens this as an editable draft (not saved yet).
    return json({ ...draft, source: 'ai' })
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return json({ error: `Claude API error (${err.status}): ${err.message}` }, 502)
    }
    return json({ error: err instanceof Error ? err.message : 'Generation failed' }, 500)
  }
}
