-- FoodQueue schema + seed
-- Run: npx wrangler d1 execute foodqueue-db --local --file=./migrations/0001_init.sql

DROP TABLE IF EXISTS grocery_items;
DROP TABLE IF EXISTS plan_items;
DROP TABLE IF EXISTS ingredients;
DROP TABLE IF EXISTS recipes;

CREATE TABLE recipes (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  emoji         TEXT NOT NULL DEFAULT '🍽️',
  image_key     TEXT,
  description   TEXT,
  cuisine       TEXT,
  servings      INTEGER NOT NULL DEFAULT 5,
  effort        INTEGER NOT NULL DEFAULT 2,    -- 0..4
  perishability TEXT NOT NULL DEFAULT 'mid',   -- high | mid | low
  health        TEXT NOT NULL DEFAULT 'mid',   -- shit | bad | mid | good | soul
  yumminess     INTEGER NOT NULL DEFAULT 5,    -- 0..10
  prep_minutes  INTEGER,
  cook_minutes  INTEGER,
  instructions  TEXT,
  notes         TEXT,
  tags          TEXT NOT NULL DEFAULT '[]',    -- JSON array
  source        TEXT NOT NULL DEFAULT 'manual',-- manual | ai
  archived      INTEGER NOT NULL DEFAULT 0,
  times_cooked  INTEGER NOT NULL DEFAULT 0,
  last_cooked   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_recipes_archived ON recipes(archived);

CREATE TABLE ingredients (
  id         TEXT PRIMARY KEY,
  recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  quantity   REAL,
  unit       TEXT,
  category   TEXT,                              -- produce|dairy|protein|pantry|spice|other
  note       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_ingredients_recipe ON ingredients(recipe_id);

CREATE TABLE plan_items (
  id               TEXT PRIMARY KEY,
  recipe_id        TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  stage            TEXT NOT NULL DEFAULT 'pick',   -- pick (pre-shop) | cook (this week)
  position         INTEGER NOT NULL DEFAULT 0,
  planned_servings INTEGER NOT NULL DEFAULT 5,
  cooked           INTEGER NOT NULL DEFAULT 0,
  joker            INTEGER NOT NULL DEFAULT 0,
  added_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_plan_recipe ON plan_items(recipe_id);
CREATE INDEX idx_plan_stage ON plan_items(stage);

CREATE TABLE grocery_items (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  quantity   REAL,
  unit       TEXT,
  category   TEXT,
  checked    INTEGER NOT NULL DEFAULT 0,
  source     TEXT NOT NULL DEFAULT 'manual',    -- plan | manual
  recipe_ids TEXT NOT NULL DEFAULT '[]',        -- JSON array of contributing recipe ids
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Seed: 47 dishes from the Notion meal planner (perishability/effort/health/yumminess)
-- ---------------------------------------------------------------------------
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('41cf8595-9304-46c4-a040-31ecd7115003','Balkan dinner','🍽️','high',0,'good',6,'["quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('8100bce9-ae23-41c9-987e-2f3110153820','Rat dinner','🍽️','mid',0,'mid',5,'["quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('63e3ccf7-852b-4589-b2e2-2c39c6ec0d19','Ovengemüse','🍽️','high',1,'mid',6,'["quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('044844dd-eb5e-47f1-b9b5-a5fef1a19d00','Couscous salad','🥗','high',2,'good',8,'["hot weather"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('6533c0d5-2ac0-475f-a65d-363dc6424f6d','Onion soup','🍲','mid',4,'soul',10,'["cold weather", "high effort"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('c72c0985-a6f0-475a-a55e-738538555f58','Tomato pasta','🍝','low',1,'mid',5,'["italian", "quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('1113a210-73f0-4835-8e66-4d19207b4864','Ramen','🍜','low',0,'shit',3,'["japanese", "quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('406207e3-e34f-4bd8-b43a-ff60a34d251b','Burgers','🍔','high',3,'mid',8,'["high effort"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('3b61e15f-7172-4bca-84d9-7eb1c50f6f99','Mushroom risotto','🍚','high',3,'mid',6,'["italian", "cold weather", "high effort"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('c264f365-1b99-4ab8-ac90-d48b40961e19','Miso soup (with rice)','🍲','low',2,'good',7,'["japanese", "cold weather"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('c6d8e0cd-91e6-4ce3-86a9-9e405685b5f6','Creamy gnocchi','🍝','mid',2,'mid',5,'["italian", "cold weather"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('c1e43360-a265-4e18-bd4d-c3e6129eea64','Pizza (selfmade)','🍕','high',4,'bad',8,'["italian", "high effort"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('bfac410d-6806-4006-8b41-9091983e4914','Pizza (store bought)','🍕','mid',1,'shit',4,'["italian", "quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('517e77b0-4829-4ec6-8c73-1ccc4590a9be','Korean toast','🍞','high',1,'mid',6,'["korean", "quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('66cc70fa-3ed0-4206-b31f-e84570640784','Onigiri / sushi','🍙','high',2,'good',7,'["japanese"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('36746d3f-421d-4a06-9e0b-eda1c2effe42','Nüddeli suppe','🍲','high',0,'soul',10,'["cold weather", "quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('cbee0269-5a61-4af1-98e0-2a89ab4206c2','Lasagna','🍝','mid',3,'soul',7,'["italian", "high effort"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('b8ed9169-05a2-4d34-aa41-7a1057ccbed4','Filled mushrooms','🍄','high',2,'good',9,'[]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('4fc20b09-c24c-4f89-ab5b-35ab42447111','Grilled cheese','🧀','mid',1,'shit',3,'["quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('a5ad14ac-bc34-4204-9de5-bb58181fc393','Feta pasta','🍝','low',1,'mid',7,'["italian", "quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('096e4235-674e-4612-bc06-a5969f0bcf2e','Parmesan potatoes','🥔','mid',2,'bad',6,'[]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('325c892d-88c3-4175-99d7-335da2cef9aa','Döner tofu wraps (+guac)','🌯','high',3,'bad',8,'["high effort"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('d30f99a5-9291-4569-917c-c1d1a12b2aed','Pesto pasta','🍝','high',1,'mid',3,'["italian", "quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('ae68a330-b225-4760-b48b-b3f36d48c211','Hochzeitssuppe','🍲','high',3,'mid',8,'["cold weather", "high effort"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('5df01ffb-700b-4431-91eb-168e4e75a398','Udon curry','🍜','mid',3,'mid',7,'["japanese", "cold weather", "high effort"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('330df978-dbfa-4a26-9c67-e1bf7ab9f7d1','Brown food','🍽️','high',0,'shit',3,'["quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('3c7c0105-8577-4248-9509-d27f3a404af1','Rice bowl','🍚','high',2,'good',6,'[]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('66efb831-e4d2-4317-a3e1-fe0af5112395','Shashuka','🍳','high',2,'good',7,'[]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('e561a479-215c-4787-a227-9bdc7d29dfd0','Veggies cream soup','🍲','high',2,'good',6,'["cold weather"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('250184bc-cccf-4259-b630-b2e2812f6011','Tomato cream soup','🍲','high',2,'good',7,'["cold weather"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('3a0d0ade-d823-4ddc-b295-b0e321eb7852','Scrambled egg','🍳','mid',1,'mid',4,'["quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('c11dbbac-5f25-445f-95d6-fb2dab943715','Avocado toast','🍞','high',1,'mid',5,'["hot weather", "quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('64f27da1-e3f0-416d-b072-84378b11c6c8','Creamy pasta','🍝','mid',2,'mid',5,'["italian"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('5cd972ae-a9c1-4a96-bd2f-e23aff787e18','Veggie stirfry','🍳','high',2,'mid',5,'[]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('61ee3411-856e-4d57-a5ad-fb5144fbf1bd','Focaccia with cucumber salad','🥖','high',3,'bad',9,'["italian", "hot weather", "high effort"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('71e80c6a-053a-4a64-b449-451bd7b0a025','Bibim guksu cold korean noodle salad','🍜','high',2,'good',8,'["korean", "hot weather"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('129d1dbc-ddf8-4323-b38f-8adac6c36a8d','Kimchi salad','🥗','high',2,'good',8,'["korean", "hot weather"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('defa451a-38bc-40a5-b231-48e79dcd509a','Ruccola salad','🥗','high',2,'good',7,'["hot weather"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('92cf829a-c317-4124-a405-e56d7cdc318b','Greek salad','🥗','high',2,'good',7,'["hot weather"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('74dd2283-4f2a-4c6f-b5d8-e88ab8f67713','Dill potato','🥔','mid',1,'mid',8,'["quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('6a0b3cd4-af35-4718-9236-3188d08b794e','Japchae','🍜','mid',1,'mid',7,'["korean", "quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('a5814405-93e7-4a29-ba97-b8798690afd3','Sulma (Korean Cold Noodles)','🍜','low',1,'bad',7,'["korean", "hot weather", "quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('a9c68f07-9339-4557-98f6-b915c2f0dbad','Bean Salad','🥗','mid',2,'good',6,'["hot weather"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('f9d1bc25-0a5c-426c-961b-0aee566700ea','Summerroll Salad','🥗','mid',2,'mid',5,'["hot weather"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('0d9a885e-e91d-4193-a2e8-1e39cab810cd','Gochujan Eggs','🍳','mid',1,'good',9,'["korean", "quick"]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('29f4bfb7-f9b6-4f47-9282-4fdf3bf869c9','Tomato Egg Dip','🍳','mid',2,'mid',5,'[]','manual',5);
INSERT INTO recipes (id,name,emoji,perishability,effort,health,yumminess,tags,source,servings) VALUES ('bb4b969d-513f-4bff-9ac0-971a645375c0','Beans alla Mutard','🫘','mid',2,'mid',5,'[]','manual',5);
