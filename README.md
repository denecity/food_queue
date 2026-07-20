# FoodQueue 🍽️

A personal, mobile-first meal-planning app for two. Swipe to pick dishes for the week,
keep a grocery list, rate & categorize recipes, and generate new recipes with the Claude API.

Hosted on **Cloudflare Pages** with **D1** (state) + **R2** (recipe photos).
See [SPEC.md](SPEC.md) for the full design.

## Stack
React 18 · Vite · TypeScript · Tailwind · Cloudflare Pages Functions · D1 · R2 · Claude API

## The weekly flow
1. **Swipe** 🔥 — swipe right to add a dish to your **picks** for the next shop.
2. **Plan** 📋 — review picks (effort balance, perishability order).
3. **Shop** 🛒 — *Rebuild from picks* → check off as you shop.
4. **Begin week** ✅ (on the Plan tab) — once you've shopped: picks → **Cook**, shopping list clears.
5. **Cook** 🍳 — this week's meals, "eat first" by perishability; tick them off as you cook.
6. **Recipes** 📖 — the library: search, rate, edit, photo, or ✨ generate with Claude.

---

## Local development

> Requires **Node 18+** and npm.

```bash
npm install

# 1. Create local D1 schema + seed (first time / after schema changes)
npm run db:init        # wrangler d1 execute foodqueue-db --local --file=./migrations/0001_init.sql

# 2a. Frontend only (no API): 
npm run dev            # http://localhost:5173  (API calls 404 — UI only)

# 2b. Full stack (UI + Functions + D1 + R2), recommended:
npm run build
npx wrangler pages dev dist
# open the URL wrangler prints (serves built assets + /api/* functions + local D1/R2)
```

For the AI generate endpoint locally, put your key in a `.dev.vars` file (gitignored):

```
ANTHROPIC_API_KEY=sk-ant-...
# GENERATE_MODEL=claude-sonnet-5   # optional: sets the default model pre-selected in the UI
```

The recipe editor's **✨ Generate** box has a model picker (Opus 4.8 / Sonnet 5 / Haiku 4.5);
`GENERATE_MODEL`, if set to one of those, just changes which is selected by default.

---

## Deploy to Cloudflare

### 1. Create the D1 database and R2 bucket
```bash
npx wrangler d1 create foodqueue-db
# → paste the returned database_id into wrangler.toml ([[d1_databases]].database_id)

npx wrangler r2 bucket create foodqueue-images
```

### 2. Apply the schema (+ seed of 47 dishes)
```bash
npm run db:init:remote     # wrangler d1 execute foodqueue-db --remote --file=./migrations/0001_init.sql
```

### 3. Deploy
```bash
npm run pages:deploy       # builds, then wrangler pages deploy dist
```
(or connect the repo in the Cloudflare dashboard: build `npm run build`, output `dist`).

### 4. Bind resources & secrets (Pages → Settings → Functions)
- **D1 binding:** variable `DB` → `foodqueue-db`
- **R2 binding:** variable `IMAGES` → `foodqueue-images`
- **Secret:** `ANTHROPIC_API_KEY` (`npx wrangler pages secret put ANTHROPIC_API_KEY`)
- **Optional vars:** `GENERATE_MODEL` (default `claude-opus-4-8`), `GENERATE_SECRET`
  (if set, `/api/generate` requires header `x-generate-secret`), `MCP_SECRET`
  (if set, the `/mcp` connector requires it — see below).

> ⚠️ **No auth** by design — keep the deployed URL private. Anyone with the URL can
> trigger `/api/generate` (your Claude spend). Set `GENERATE_SECRET` if that becomes a problem.

---

## Claude connector (MCP)

`/mcp` is a remote **MCP server** (Streamable HTTP) that lets Claude read and edit the
whole app: recipes, the plan (selected dishes) and the grocery list.

**Add it in Claude** (Settings → Connectors → *Add custom connector*) with the URL
`https://<your-domain>/mcp`. Then Claude can e.g. *"add a cozy tofu stew and put it in this
week's picks"* or *"check off everything in the produce aisle"*.

Tools: `list_recipes`, `get_recipe`, `create_recipe`, `update_recipe`, `delete_recipe`,
`mark_recipe_cooked`, `list_plan`, `add_to_plan`, `remove_plan_item`, `update_plan_item`,
`begin_week`, `list_grocery`, `add_grocery_item`, `update_grocery_item`,
`remove_grocery_item`, `build_grocery_from_plan`, `clear_checked_grocery`.

> ⚠️ Like the rest of the app the endpoint is **open by default** — keep the URL private.
> Optionally set the `MCP_SECRET` env var; the endpoint then requires it as
> `Authorization: Bearer <secret>` or a `?key=<secret>` query param (handy for MCP clients
> that let you set headers or a URL). Test it: `curl -X POST https://<domain>/mcp -d
> '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`.

---

## API
`/api/recipes` (CRUD, `/:id/cooked`, `/:id/image`) · `/api/images/<key>` ·
`/api/plan` (`?stage=pick|cook`, `/begin-week`, `/clear`) · `/api/grocery` (`/build`,
`/clear-checked`) · `/api/models` · `/api/generate` · `/mcp` (Claude connector).
See [SPEC.md](SPEC.md) §4.
