# FoodQueue — Spec

A personal, mobile-first meal-planning web app for two people. Swipe to pick dishes for
the week (Tinder-style), keep a grocery shopping list, rate & categorize recipes, and
generate new recipes + ingredient lists with the Claude API.

Hosted on **Cloudflare Pages** with **D1** (state) and **R2** (recipe photos).

---

## 1. How we actually plan (from the Notion page)

- **Shopping days:** Wednesday & Saturday (early morning or evening).
- **Planning day:** Friday — decide which ~4 meals we eat first.
- **Portions:** count **5 portions per meal** (default servings = 5).
- **Perishability rule:** cook quick-perishables first (veg/fruit) → semi-perishable
  (cheese/toast) → shelf-stable (pasta/ramen). The week plan auto-orders "eat first" by
  perishability (high → low).
- **Joker:** 1×/week we may break the perish order (a one-off override on a plan item).
- **Effort balance:** aim ~50/50 low- and mid-effort meals across the week.

### Rating baselines (exactly the Notion columns)
| Baseline | Scale | Notes |
|---|---|---|
| **Perishability** | high / mid / low | drives "eat first" ordering |
| **Effort** | 0–4 | 0 = trivial, 4 = project |
| **Health** | shit / bad / mid / good / soul | "soul" = "good for soul" |
| **Yumminess** | 0–10 | the headline rating |

### Categories / tags
Curated chips the user asked for: **cold weather**, **hot weather**, **quick**,
**high effort** — plus cuisine (korean, italian, …) and freeform tags. Stored as a JSON
array on the recipe.

---

## 2. Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind (mobile-first) |
| Backend | Cloudflare Pages Functions (`/functions/api/**`) |
| Database | Cloudflare D1 (SQLite) — binding `DB` |
| Images | Pasted URL by default; **optional** Cloudflare R2 (`IMAGES` binding) for native uploads |
| AI | Claude API via `fetch` from a Pages Function (no SDK bundled) |

- **Auth:** none (per decision). The Claude endpoint is the only cost risk, so it stays
  trivially guardable: if env `GENERATE_SECRET` is set, the endpoint requires a matching
  header; unset (default) = open. Keep the deployed URL private.
- **AI model:** `GENERATE_MODEL` env, default `claude-sonnet-4-6`. Key via
  `ANTHROPIC_API_KEY` (Cloudflare secret). Structured output via a single `create_recipe`
  tool (forced tool use) so we always get valid JSON.

---

## 3. Data model (D1)

### `recipes`
| col | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| name | TEXT | |
| emoji | TEXT | card accent / fallback |
| image_key | TEXT? | pasted image URL, or R2 object key when R2 is enabled (app resolves both) |
| description | TEXT? | one-liner |
| cuisine | TEXT? | |
| servings | INT | default 5 |
| effort | INT | 0–4 |
| perishability | TEXT | high \| mid \| low |
| health | TEXT | shit \| bad \| mid \| good \| soul |
| yumminess | INT | 0–10 |
| prep_minutes | INT? | |
| cook_minutes | INT? | |
| instructions | TEXT? | markdown / numbered steps |
| notes | TEXT? | |
| tags | TEXT | JSON array |
| source | TEXT | manual \| ai |
| archived | INT | 0/1 |
| times_cooked | INT | default 0 |
| last_cooked | TEXT? | date |
| created_at / updated_at | TEXT | ISO |

### `ingredients` (per recipe)
`id PK, recipe_id FK, name, quantity REAL?, unit TEXT?, category TEXT?` (produce / dairy /
protein / pantry / spice / other — for grocery grouping), `note TEXT?, sort_order INT`.

### `plan_items` (two-stage lifecycle)
`id PK, recipe_id FK, stage TEXT, position INT, planned_servings INT default 5,
cooked INT 0/1, joker INT 0/1` (override perish order), `added_at TEXT`.

**`stage`** drives the weekly lifecycle:
- `pick` — dishes swiped/added for the **upcoming shop**. The grocery list builds from these.
- `cook` — this week's **active meals** (post-shop), perishability-ordered "eat first".

**Begin week** (`POST /api/plan/begin-week`) is the manual hinge pressed once shopping is
done: discard last week's `cook` items (exhausted) → promote `pick` → `cook` (reset cooked)
→ clear the grocery list. "Weeks" are loose: it just propagates one shopping cycle forward.
Toggling a `cook` item cooked also bumps the recipe's `times_cooked` / `last_cooked`.

### `grocery_items` (shopping list — source of truth)
`id PK, name, quantity REAL?, unit TEXT?, category TEXT?, checked INT 0/1, source TEXT
(plan|manual), recipe_ids TEXT (JSON), sort_order INT, created_at TEXT`.
"Build from week plan" aggregates planned recipes' ingredients (merge by name+unit, sum
qty), **preserving checked state** and keeping manual items.

---

## 4. API (Pages Functions)

```
GET    /api/recipes                 list (?search,&tag,&archived,&sort)
POST   /api/recipes                 create (+ ingredients[])
GET    /api/recipes/:id             one (+ ingredients)
PUT    /api/recipes/:id             update (+ replace ingredients)
DELETE /api/recipes/:id             delete
POST   /api/recipes/:id/cooked      times_cooked++, last_cooked=today

POST   /api/recipes/:id/image       upload photo → R2, set image_key
GET    /api/images/:key             stream from R2 (cached)

GET    /api/plan                    current plan items (joined recipe, perish-ordered)
POST   /api/plan                    add recipe to plan {recipe_id}
DELETE /api/plan/:id                remove item
PATCH  /api/plan/:id                {cooked?, joker?, position?}
POST   /api/plan/clear              empty the plan

GET    /api/grocery                 list (grouped by category)
POST   /api/grocery                 add manual item
PATCH  /api/grocery/:id             {checked?, name?, qty?, …}
DELETE /api/grocery/:id             remove
POST   /api/grocery/build           regenerate from week plan (merge+preserve checks)
POST   /api/grocery/clear-checked   remove checked items

POST   /api/generate                {prompt} → Claude → draft recipe JSON (not saved)
```

---

## 5. Frontend — 5 bottom tabs (mobile-first)

1. **Swipe** 🔥 — card deck of recipes not in the plan, optional category filter
   (hot/cold/quick/effort). Right = add to **picks**, left = skip (session), tap = details.
   Card = R2 photo (or emoji+gradient) + name + cuisine + rating chips (yum/effort/perish/
   health) + tags.
2. **Plan** 📋 — the **picks** for the next shop, perishability-ordered, with effort-balance
   hint (low/mid split) and per-item servings/remove. Hosts **Begin week** (after shopping)
   and "Build shopping list →".
3. **Shop** 🛒 — grocery items grouped by category/aisle, check off, add manual, "Rebuild
   from picks", "Clear checked".
4. **Cook** 🍳 — this week's **cook** list, "eat first" perishability order, cooked toggle
   (→ bumps times_cooked), joker flag.
5. **Recipes** 📖 — search/filter the library; tap → editor. FAB: **+ New** & **✨ Generate**.
   Sort by yumminess/effort/recently cooked.

### Recipe editor (create / edit)
All fields + ingredient-row editor (name/qty/unit/category) + tag chips + rating selectors
(yumminess slider 0–10, effort 0–4, perishability segmented, health segmented) + photo
upload (R2) + instructions. **✨ Generate** prompt box → `/api/generate` → prefills the
form as an editable draft before saving.

---

## 6. Theme
Dark, warm food palette (shift accent teal → tomato/amber). Big touch targets, bottom nav,
safe-area padding for mobile. Recode `index.css` + `tailwind.config.js`.

---

## 7. Seed data
Migration seeds the **44 dishes** from the Notion table with their perishability / effort /
health / yumminess, fixing mangled umlauts (ovengemüse, nüddeli suppe, döner tofu wraps)
and deriving obvious tags (korean, soup→cold weather, cold noodles→hot weather, effort 0→
quick). Ingredients/instructions start empty — fill via editor or AI later.

---

## 8. Build order (iterative)
1. Scaffolding: deps, `wrangler.toml` (D1+R2), drop game code. ← start here
2. Migration `0001_init.sql` + seed.
3. Backend functions: recipes, ingredients, plan, grocery, image, generate.
4. Frontend: types → api client → hooks → screens → theme → nav.
5. Typecheck/build, run locally, iterate.

> Open API-cost note: with no auth, anyone with the URL can trigger `/api/generate`. Set
> `GENERATE_SECRET` later if abuse appears.
