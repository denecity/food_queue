-- 0006: remember how much the pantry holds of a stocked grocery item.
-- Partly stocked: `quantity` is what's left to buy, total needed = quantity + in_stock.
-- Fully stocked (have = 1): `quantity` is the total needed, nothing to buy.
ALTER TABLE grocery_items ADD COLUMN in_stock REAL;
