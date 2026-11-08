-- 0002: unified ingredient register + stock (pantry/fridge) + price observations.
--
-- Run once (local then remote):
--   npx wrangler d1 execute foodqueue-db --local  --file=./migrations/0002_ingredient_register.sql
--   npx wrangler d1 execute foodqueue-db --remote --file=./migrations/0002_ingredient_register.sql
--
-- This does NOT drop recipes/ingredients/grocery. It adds the register as the hub
-- every recipe line and stock item points at, then backfills existing recipe
-- ingredient lines into it (one entry per distinct normalized name). Semantic
-- de-duplication (e.g. "tomato" vs "tomatoes") is left to the merge_ingredients
-- tool afterwards — the backfill is deterministic on purpose.
--
-- The three new tables are dropped+recreated so this file is safe to re-run; the
-- two ALTER TABLE ADD COLUMN statements are not (SQLite has no IF NOT EXISTS for
-- columns), so on a re-run comment them out if the columns already exist.

DROP TABLE IF EXISTS price_observations;
DROP TABLE IF EXISTS stock_items;
DROP TABLE IF EXISTS ingredient_register;

-- The hub ----------------------------------------------------------------------
CREATE TABLE ingredient_register (
  id               TEXT PRIMARY KEY,
  canonical_name   TEXT NOT NULL,                 -- display name, e.g. "Tomato"
  norm_key         TEXT NOT NULL UNIQUE,          -- lower(trim(name)); the join key
  aliases          TEXT NOT NULL DEFAULT '[]',    -- JSON array of other norm keys that mean this
  category         TEXT NOT NULL DEFAULT 'other', -- aisle category (produce|dairy|…|asian)
  default_unit     TEXT,                          -- usual tracking unit (g, pcs, ml)
  default_location TEXT NOT NULL DEFAULT 'pantry',-- fridge | freezer | pantry | spice
  staple           INTEGER NOT NULL DEFAULT 0,    -- always-assumed-present (oil, salt, rice)
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_register_norm ON ingredient_register(norm_key);

-- What's physically on hand ----------------------------------------------------
CREATE TABLE stock_items (
  id            TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES ingredient_register(id) ON DELETE CASCADE,
  quantity      REAL,
  unit          TEXT,
  location      TEXT NOT NULL DEFAULT 'pantry',   -- fridge | freezer | pantry | spice
  expires_on    TEXT,                             -- date, optional
  opened_on     TEXT,                             -- date, optional
  source        TEXT NOT NULL DEFAULT 'chat',     -- chat | putaway | photo | manual
  added_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_stock_ingredient ON stock_items(ingredient_id);
CREATE INDEX idx_stock_expires ON stock_items(expires_on);

-- Append-only "I bought X at Y for Z" log --------------------------------------
CREATE TABLE price_observations (
  id            TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES ingredient_register(id) ON DELETE CASCADE,
  store         TEXT NOT NULL,                    -- "Coop", "Migros", "Asia-Markt", …
  price         REAL,                             -- CHF, optional
  pack_qty      REAL,                             -- e.g. 400  → price per unit
  pack_unit     TEXT,                             -- e.g. "g"
  observed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  source        TEXT NOT NULL DEFAULT 'chat'
);
CREATE INDEX idx_price_ingredient ON price_observations(ingredient_id);

-- Link existing rows to the register (nullable; backfilled below) ---------------
ALTER TABLE ingredients   ADD COLUMN ingredient_id TEXT REFERENCES ingredient_register(id);
ALTER TABLE grocery_items ADD COLUMN ingredient_id TEXT REFERENCES ingredient_register(id);

-- Backfill: one register entry per distinct normalized ingredient name in use.
-- category/default_unit take the most common non-empty value seen for that name.
INSERT INTO ingredient_register (id, canonical_name, norm_key, category, default_unit, default_location)
SELECT
  lower(hex(randomblob(16))),
  MIN(TRIM(name)),
  lower(trim(name)),
  COALESCE((
    SELECT i2.category FROM ingredients i2
    WHERE lower(trim(i2.name)) = lower(trim(i.name))
      AND i2.category IS NOT NULL AND TRIM(i2.category) <> ''
    GROUP BY i2.category ORDER BY COUNT(*) DESC LIMIT 1
  ), 'other'),
  (
    SELECT i3.unit FROM ingredients i3
    WHERE lower(trim(i3.name)) = lower(trim(i.name))
      AND i3.unit IS NOT NULL AND TRIM(i3.unit) <> ''
    GROUP BY i3.unit ORDER BY COUNT(*) DESC LIMIT 1
  ),
  'pantry'
FROM ingredients i
WHERE TRIM(i.name) <> ''
GROUP BY lower(trim(i.name));

-- Default storage location inferred from the resolved category.
UPDATE ingredient_register SET default_location = CASE
  WHEN category IN ('produce', 'dairy', 'protein') THEN 'fridge'
  WHEN category = 'frozen' THEN 'freezer'
  WHEN category = 'spice'  THEN 'spice'
  ELSE 'pantry'
END;

-- Point every recipe ingredient line at its register entry.
UPDATE ingredients
SET ingredient_id = (SELECT r.id FROM ingredient_register r WHERE r.norm_key = lower(trim(ingredients.name)))
WHERE TRIM(name) <> '';
