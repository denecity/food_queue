-- 0006: remember how much of a partly-stocked grocery item the pantry covers.
-- `quantity` stays what's left to buy; total needed = quantity + in_stock.
ALTER TABLE grocery_items ADD COLUMN in_stock REAL;
