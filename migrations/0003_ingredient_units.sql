-- 0003: canonical unit + step size per ingredient.
--
-- Run once (local then remote):
--   npx wrangler d1 execute foodqueue-db --local  --file=./migrations/0003_ingredient_units.sql
--   npx wrangler d1 execute foodqueue-db --remote --file=./migrations/0003_ingredient_units.sql
--
-- Each register entry already has default_unit (the canonical unit for that
-- ingredient). This adds `step`: the natural increment for that ingredient, used
-- by the Stock tab's -/+ buttons and as a sensible default quantity. Backfilled
-- from the unit (g->50, ml->100, countable->1). Not re-runnable (ADD COLUMN).

ALTER TABLE ingredient_register ADD COLUMN step REAL;

UPDATE ingredient_register SET step = CASE LOWER(COALESCE(default_unit, ''))
  WHEN 'g'    THEN 50
  WHEN 'gram' THEN 50
  WHEN 'kg'   THEN 1
  WHEN 'ml'   THEN 100
  WHEN 'cl'   THEN 10
  WHEN 'dl'   THEN 1
  WHEN 'l'    THEN 1
  WHEN 'tbsp' THEN 1
  WHEN 'tsp'  THEN 1
  ELSE 1
END
WHERE step IS NULL;
