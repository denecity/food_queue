# Ingredient register + Stock + Prices — feature description

Design notes for the next layer of FoodQueue. Three things, built on one foundation:

- **Ingredient register** — one canonical list of ingredients. Every recipe line and every stock item refers to an entry in it. This is the hub; everything else is a spoke.
- **Stock** — what's in the fridge/freezer/pantry right now, with expiry, captured mainly **by talking to Claude in chat**.
- **Prices & origins** — each thing added to stock can carry *where it was bought* and *what it cost*, so we build our own per-store price history and can compare origins.

Grounded in the current schema (`recipes`, `ingredients`, `plan_items`, `grocery_items`), the aisle categories in `src/lib/ui.ts`, the MCP surface in `functions/_lib/mcp-tools.ts`, and the existing Anthropic stack.

Decisions locked in from discussion:
- A **unified ingredient register is the backbone**, not an optional phase-2 — recipes and stock both reference it.
- **Chat / voice-in via the MCP connector is the primary capture.** The MCP gets modified to support it; in-app camera/mic are deferred.
- A speaking session **starts by stating the store**, and items can carry a **price**, so origins are registered and comparable.

---

## 1. The ingredient register (the foundation)

### 1.1 Why

Today ingredients are free text in two unrelated places: recipe lines (`ingredients.name`) and the grocery list (`grocery_items.name`, aggregated by a `name|unit` string key in `functions/_lib/grocery.ts`). `"tomato"`, `"tomatoes"`, `"cherry tomatoes"` are one thing to a human and several strings to the DB. Stock would add a fourth. Nothing can reliably answer "do I already have this?" or "what does this usually cost?" while identity is a string.

A register fixes identity once. Every recipe line, every stock item, every price observation points at the same `ingredient_id`. Matching becomes a key comparison instead of fuzzy string work.

### 1.2 Schema

```sql
-- The hub.
CREATE TABLE ingredient_register (
  id             TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,          -- "tomato"
  aliases        TEXT NOT NULL DEFAULT '[]', -- JSON: ["tomatoes","cherry tomato","Rispentomaten"]
  category       TEXT NOT NULL DEFAULT 'other', -- aisle category (produce|dairy|…|asian)
  default_unit   TEXT,                   -- "g", "pcs", "ml" — the unit we usually track it in
  default_location TEXT DEFAULT 'pantry',-- fridge | freezer | pantry | spice  (for stock)
  staple         INTEGER NOT NULL DEFAULT 0, -- always-assumed-present (oil, salt, rice)
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_register_name ON ingredient_register(canonical_name);

-- Recipe lines now reference the register (keep qty/unit/note per recipe).
ALTER TABLE ingredients ADD COLUMN ingredient_id TEXT REFERENCES ingredient_register(id);
-- (category becomes redundant on the line — it lives on the register entry.)

-- Stock references the register too.
CREATE TABLE stock_items (
  id            TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES ingredient_register(id),
  quantity      REAL,
  unit          TEXT,
  location      TEXT NOT NULL DEFAULT 'pantry',
  expires_on    TEXT,                    -- the date the user wants to track
  opened_on     TEXT,
  source        TEXT NOT NULL DEFAULT 'chat', -- chat | putaway | photo | manual
  added_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_stock_ingredient ON stock_items(ingredient_id);
CREATE INDEX idx_stock_expires ON stock_items(expires_on);

-- Append-only purchase/price log — one row per "I bought X at Y for Z".
CREATE TABLE price_observations (
  id            TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES ingredient_register(id),
  store         TEXT NOT NULL,           -- "Coop", "Migros", "Asia-Markt", …
  price         REAL,                    -- CHF, optional
  pack_qty      REAL,                    -- e.g. 400
  pack_unit     TEXT,                    -- e.g. "g"  → enables price-per-unit compare
  observed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  source        TEXT NOT NULL DEFAULT 'chat'
);
CREATE INDEX idx_price_ingredient ON price_observations(ingredient_id);
```

Design calls:
- **Resolve-or-create, don't force pre-registration.** You never pick from a list while cooking or unpacking. You say a name; the write path resolves it to a register entry, creating one (with sensible category/unit/location defaults) if it's new. The register maintains itself as a side effect. Occasional `merge_ingredients` passes clean up dups.
- **Quantities are soft.** Stock is "don't rebuy / don't let it rot," not warehouse accounting.
- **Price is separate from stock.** Buying is an event (append to `price_observations`); having is a state (`stock_items`). One chat action can write both.

### 1.3 Migrating the existing 47 recipes

One-time AI-assisted pass: read every `ingredients.name`, cluster to canonical entries, write the register, backfill `ingredient_id` on each line. Claude is well-suited to the dedup/normalization. Leave `ingredient_id` nullable until the pass is done so nothing breaks mid-migration.

---

## 2. Capture — talking to Claude in chat (primary)

The decision is to make the **MCP connector the main way in**: you speak or type to Claude, it resolves your words into register-backed stock and price rows. No app screen, no form. This is the lowest-friction path and reuses the connector that already exists.

### 2.1 The session shape

A "putting the shopping away" conversation looks like:

> **You:** "Adding what I got at Coop. Tomatoes, 400g tin, 1.20. A block of feta, 2.95, expires 20th of Nov. Three peppers. Open jar of pesto, goes off next week."

From one utterance Claude should:
1. Note the **store for the session** = Coop (stated once, up front — your idea). It carries to every item until you name a different store.
2. For each item: resolve name → register (`find_or_create_ingredient`), add stock (`add_stock_item` with qty/unit/location/expiry), and if a price was said, log a purchase (`store`, `price`, `pack_qty`, `pack_unit`).
3. Fill units/locations/categories from register defaults; read relative dates ("next week", "the 20th") into `expires_on`.
4. Ask only on genuine ambiguity (e.g. "peppers — fridge, and no price?"), not for every field.

Stating the store once at the top is what makes price comparison cheap: every row that session is tagged with where it came from, so over weeks you accumulate "feta: 2.95 Coop / 2.60 Migros / …" without ever running a comparison tool.

### 2.2 What the MCP needs (modifications)

The connector is **stateless per call** — the "session store = Coop" context lives in the chat, and Claude passes `store` on each write. So the changes are tools + params, not server-side sessions:

New / changed tools in `functions/_lib/mcp-tools.ts`:
- `list_ingredients` — read the register (search by name/alias).
- `find_or_create_ingredient` `{name, category?, default_unit?, default_location?}` → returns an `ingredient_id`, creating the entry if new. The resolve step every other write leans on.
- `merge_ingredients` `{keep_id, merge_id}` — fold a duplicate in (re-point recipe lines, stock, prices; move the name to aliases).
- `add_stock_item` `{ingredient (name or id), quantity?, unit?, location?, expires_on?, store?, price?, pack_qty?, pack_unit?}` — resolves the ingredient, inserts stock, and **if `store`/`price` present, also appends a `price_observations` row** in the same call. This single tool backs the whole chat flow.
- `list_stock` `{location?, expiring_within_days?}`, `update_stock_item`, `consume_stock` `{ingredient, quantity?}` (mark used/used-up).
- `get_price_history` `{ingredient}` → per-store last/avg price and price-per-unit, for "where's feta cheapest?".
- **`create_recipe` / `update_recipe` change:** ingredient lines resolve to register entries on write (call `find_or_create_ingredient` per line, store `ingredient_id`). The generate.ts system prompt gains a line about the register so AI-authored recipes land clean.

Everything the model does here is natural-language → tool calls; no new UI is required to start using it.

### 2.3 Deferred capture paths (not now, but the schema supports them)

- **Put-away from the shopping list** — turn checked `grocery_items` into stock in one tap (they already carry name/qty/category). Cheapest capture once a UI exists.
- **Photo of items / receipt** — Claude vision → `register_stock` draft, reading expiry dates off packaging; receipts are itemized in CH. Deferred per your call, but `stock_items.source = 'photo'` and the register make it a drop-in later.
- **In-app voice button** (Web Speech API → same parse) — redundant with chat voice for now.

---

## 3. Stock overview UI

Still worth a thin **Stock** tab even with chat capture, as the read-model:
- Grouped by **location** (Fridge / Freezer / Pantry / Spices) — where you physically look.
- **"Expiring soon"** pinned on top (within N days, plus old high-perishables) — the waste-reduction payoff.
- Rows link to the register entry; tap to edit qty/expiry/location or `consume`.
- Reuses the Shop screen's visual language.

---

## 4. How it wires into the FoodQueue loop (the payoff)

With everything keyed on `ingredient_id`:

1. **Grocery list subtracts stock.** In `buildGroceryFromPlan`, aggregate recipe lines by `ingredient_id` (cleaner than today's `name|unit`), then subtract `stock_items` on hand: `needed = max(0, required − onHand)`. Fully-stocked items drop out or collapse into "✓ already have"; staples never appear. **Headline feature: stop buying what's in the fridge.**
2. **Shop smarter with price history.** Each grocery item can show its cheapest known store and last price from `price_observations`, and the list can be **split by store** (default store for most; `asian`/specialty items to the specialty shop — the aisle model already leans this way). This is the "where to shop" answer, built entirely from your own spoken purchases — no scraping.
3. **"Cook from what I have."** Per recipe, count lines whose `ingredient_id` is in stock → "8/10 on hand" badge + a "cookable now" filter.
4. **Expiry → suggestions.** "Spinach expires in 2 days" → surface recipes using that `ingredient_id`, or ask Claude "what can I cook from what's expiring?". Plugs into the existing perishability-first cook order, now at ingredient granularity.

---

## 5. On scraping Coop/Migros (mostly obviated)

The earlier plan considered scraping store sortiment to compare prices. The register-plus-spoken-purchases design makes most of that unnecessary: you build an accurate, per-*your-branch*, legitimate price catalog from what you actually buy, with zero ToS risk and no scraper upkeep. Keep in mind if ever revisited:
- No official public product APIs; Coop/Migros SPAs hit internal endpoints, ToS restricts automated access, and bot defenses make scraping *from the Cloudflare Worker* unreliable.
- Per-branch shelf stock isn't exposed, so "which store physically has it now" stays unanswerable from public data.
- Better external source than scraping, if more coverage is ever wanted: **digital receipts** via Supercard (Coop) / Cumulus (Migros) — itemized, accurate, yours. Those could auto-populate `price_observations` the same way chat does.
- If pursued anyway: a **Cron-triggered** or external scraper writing `store_products(name, brand, price, store, scraped_at)`, read-only from the app, item *search* over full *mirror*, cache hard, show staleness. Treat as optional/experimental.

---

## 6. Minimal first slice

1. `ingredient_register` + `price_observations` tables; `ingredient_id` on `ingredients` and new `stock_items`.
2. MCP tools: `find_or_create_ingredient`, `list_ingredients`, `add_stock_item` (with store/price), `list_stock`, `consume_stock`, `get_price_history`. **This alone makes the whole chat-capture flow work with no new UI.**
3. One-time migration of the 47 recipes' ingredient lines into the register.
4. `buildGroceryFromPlan` keys on `ingredient_id` and subtracts stock (the payoff).

Phase 2+: Stock tab UI, store-split + price annotations on the grocery list, cookability badges, expiry suggestions, put-away/photo/receipt capture, `merge_ingredients` cleanup tooling.

---

## Build status (first slice — done)

Implemented on `main`:
- **`migrations/0002_ingredient_register.sql`** — `ingredient_register`, `stock_items`, `price_observations`; `ingredient_id` added to `ingredients` and `grocery_items`; deterministic backfill of existing recipe lines into the register (validated against a scratch DB — duplicate-casing names collapse, blanks skip).
- **`functions/_lib/register.ts`** — `normKey`, `resolveIngredient` (exact + alias), `findOrCreateIngredient` (race-safe).
- **`functions/_lib/recipes.ts`** — `replaceIngredients` now resolves every line to an `ingredient_id`, so the register self-maintains on any recipe save (MCP and the app UI both go through this).
- **`functions/_lib/grocery.ts`** — grocery build aggregates by `ingredient_id`, **skips staples**, and **subtracts on-hand stock** (conservative: only matching-unit numeric subtraction, so worst case is a rebuy, never a silent shortfall).
- **`functions/_lib/images.ts`** — `storeRecipeImageFromUrl` fetches a link into R2 and sets `image_key`.
- **`functions/_lib/mcp-tools.ts`** — new tools: `list_ingredients`, `find_or_create_ingredient`, `merge_ingredients`, `list_stock`, `add_stock_item` (logs a price observation when a store is given), `update_stock_item`, `consume_stock`, `remove_stock_item`, `add_price_observation`, `get_price_history`. `create_recipe` / `update_recipe` gained `image_url` (fetched) and `image_key` (direct).

**To activate:** run the migration, then redeploy.
```bash
npx wrangler d1 execute foodqueue-db --local  --file=./migrations/0002_ingredient_register.sql
npx wrangler d1 execute foodqueue-db --remote --file=./migrations/0002_ingredient_register.sql
npm run pages:deploy
```

Not yet built (phase 2, per §6): Stock tab UI, store-split + price annotations on the grocery list, cookability badges, expiry suggestions, put-away/photo/receipt capture. The chat/voice capture path works now with no further UI — it's just the MCP tools above.

## One-line summary

The **ingredient register** is the hub every recipe and stock item points at. You keep it fed by **talking to Claude** — "here's what I got at Coop, with prices and expiry dates" — which in one step updates stock, registers the ingredient, and logs the price. The grocery list then shows only what you *don't* have, routed to the cheapest store you've seen — all from your own words, no scraping.
