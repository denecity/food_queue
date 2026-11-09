-- 0004: mark grocery items you already have instead of dropping them.
--
-- Run once (local then remote):
--   npx wrangler d1 execute foodqueue-db --local  --file=./migrations/0004_grocery_have.sql
--   npx wrangler d1 execute foodqueue-db --remote --file=./migrations/0004_grocery_have.sql
--
-- `have` = 1 when the plan already covers this item from stock or it's a staple;
-- the shopping list shows these in a separate "already have" section rather than
-- omitting them. Not re-runnable (ADD COLUMN).

ALTER TABLE grocery_items ADD COLUMN have INTEGER NOT NULL DEFAULT 0;
