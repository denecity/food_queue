-- 0005: optional default shelf life per ingredient.
--
-- Run once (local then remote):
--   npx wrangler d1 execute foodqueue-db --local  --file=./migrations/0005_shelf_life.sql
--   npx wrangler d1 execute foodqueue-db --remote --file=./migrations/0005_shelf_life.sql
--
-- Days a fresh purchase keeps. Stock added without an expiry date gets
-- today + this many days. NULL means no default. Not re-runnable (ADD COLUMN).

ALTER TABLE ingredient_register ADD COLUMN shelf_life_days INTEGER;
