-- Create glossary tables to improve search functionality

-- Main glossary for term standardization
CREATE TABLE IF NOT EXISTS glossary_terms (
  id SERIAL PRIMARY KEY,
  standard_term VARCHAR(100) NOT NULL,
  term_type VARCHAR(50) NOT NULL, -- 'ingredient', 'cuisine', 'cooking_method', 'dietary', etc.
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for variant spellings, synonyms, and related terms
CREATE TABLE IF NOT EXISTS glossary_variants (
  id SERIAL PRIMARY KEY,
  glossary_term_id INTEGER NOT NULL REFERENCES glossary_terms(id) ON DELETE CASCADE,
  variant_term VARCHAR(100) NOT NULL,
  variant_type VARCHAR(50) NOT NULL, -- 'synonym', 'misspelling', 'abbreviation', 'plural', etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(variant_term, glossary_term_id)
);

-- Table for related terms (e.g., "Jewish food" relates to specific dishes)
CREATE TABLE IF NOT EXISTS glossary_related_terms (
  id SERIAL PRIMARY KEY,
  source_term_id INTEGER NOT NULL REFERENCES glossary_terms(id),
  related_term_id INTEGER NOT NULL REFERENCES glossary_terms(id),
  relation_type VARCHAR(50) NOT NULL, -- 'is_part_of', 'belongs_to_cuisine', 'substitute_for', etc.
  strength FLOAT DEFAULT 1.0, -- How strongly terms are related (0.0-1.0)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_term_id, related_term_id, relation_type)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_glossary_standard_term ON glossary_terms(standard_term);
CREATE INDEX IF NOT EXISTS idx_glossary_term_type ON glossary_terms(term_type);
CREATE INDEX IF NOT EXISTS idx_glossary_variant_term ON glossary_variants(variant_term);

-- Insert some sample data for common misspellings and synonyms

-- Challah bread and variants
INSERT INTO glossary_terms (standard_term, term_type, description) 
VALUES ('Challah', 'ingredient', 'Traditional Jewish braided bread') 
ON CONFLICT DO NOTHING;

-- Update subquery to ensure only one row is returned
INSERT INTO glossary_variants (glossary_term_id, variant_term, variant_type)
VALUES 
((SELECT id FROM glossary_terms WHERE standard_term = 'Challah' LIMIT 1), 'chala', 'misspelling'),
((SELECT id FROM glossary_terms WHERE standard_term = 'Challah' LIMIT 1), 'halla', 'misspelling'),
((SELECT id FROM glossary_terms WHERE standard_term = 'Challah' LIMIT 1), 'chalah', 'misspelling'),
((SELECT id FROM glossary_terms WHERE standard_term = 'Challah' LIMIT 1), 'challah bread', 'synonym')
ON CONFLICT DO NOTHING;

-- Jewish cuisine terms
INSERT INTO glossary_terms (standard_term, term_type, description) 
VALUES ('Jewish', 'cuisine', 'Traditional Jewish food encompassing Ashkenazi, Sephardic, and other Jewish culinary traditions') 
ON CONFLICT DO NOTHING;

-- Update subquery to ensure only one row is returned
INSERT INTO glossary_variants (glossary_term_id, variant_term, variant_type)
VALUES 
((SELECT id FROM glossary_terms WHERE standard_term = 'Jewish' LIMIT 1), 'jewish food', 'synonym'),
((SELECT id FROM glossary_terms WHERE standard_term = 'Jewish' LIMIT 1), 'jewish cuisine', 'synonym'),
((SELECT id FROM glossary_terms WHERE standard_term = 'Jewish' LIMIT 1), 'kosher', 'related'),
((SELECT id FROM glossary_terms WHERE standard_term = 'Jewish' LIMIT 1), 'hebrew', 'related')
ON CONFLICT DO NOTHING;

-- Popular Jewish dishes as related terms
INSERT INTO glossary_terms (standard_term, term_type, description) 
VALUES 
('Matzah Ball Soup', 'dish', 'Traditional Jewish soup with dumplings made from matzah meal'),
('Gefilte Fish', 'dish', 'Traditional Jewish dish made from ground fish'),
('Latkes', 'dish', 'Potato pancakes traditionally served during Hanukkah'),
('Kugel', 'dish', 'Baked pudding or casserole, usually made from egg noodles or potatoes')
ON CONFLICT DO NOTHING;

-- Connect Jewish cuisine to specific dishes
INSERT INTO glossary_related_terms (source_term_id, related_term_id, relation_type, strength)
VALUES
((SELECT id FROM glossary_terms WHERE standard_term = 'Jewish' LIMIT 1), 
 (SELECT id FROM glossary_terms WHERE standard_term = 'Challah' LIMIT 1), 
 'includes_dish', 0.9),
((SELECT id FROM glossary_terms WHERE standard_term = 'Jewish' LIMIT 1), 
 (SELECT id FROM glossary_terms WHERE standard_term = 'Matzah Ball Soup' LIMIT 1), 
 'includes_dish', 0.9),
((SELECT id FROM glossary_terms WHERE standard_term = 'Jewish' LIMIT 1), 
 (SELECT id FROM glossary_terms WHERE standard_term = 'Gefilte Fish' LIMIT 1), 
 'includes_dish', 0.8),
((SELECT id FROM glossary_terms WHERE standard_term = 'Jewish' LIMIT 1), 
 (SELECT id FROM glossary_terms WHERE standard_term = 'Latkes' LIMIT 1), 
 'includes_dish', 0.9),
((SELECT id FROM glossary_terms WHERE standard_term = 'Jewish' LIMIT 1), 
 (SELECT id FROM glossary_terms WHERE standard_term = 'Kugel' LIMIT 1), 
 'includes_dish', 0.8)
ON CONFLICT DO NOTHING;

-- Other common ingredients with variants
INSERT INTO glossary_terms (standard_term, term_type, description) 
VALUES 
('Green Onion', 'ingredient', 'Long, thin onions with green tops and small white bulbs'),
('Eggplant', 'ingredient', 'Purple vegetable with spongy flesh'),
('Bell Pepper', 'ingredient', 'Sweet, bell-shaped peppers available in different colors')
ON CONFLICT DO NOTHING;

-- Update subqueries to ensure only one row is returned
INSERT INTO glossary_variants (glossary_term_id, variant_term, variant_type)
VALUES 
((SELECT id FROM glossary_terms WHERE standard_term = 'Green Onion' LIMIT 1), 'scallion', 'synonym'),
((SELECT id FROM glossary_terms WHERE standard_term = 'Green Onion' LIMIT 1), 'spring onion', 'synonym'),
((SELECT id FROM glossary_terms WHERE standard_term = 'Eggplant' LIMIT 1), 'aubergine', 'synonym'),
((SELECT id FROM glossary_terms WHERE standard_term = 'Bell Pepper' LIMIT 1), 'capsicum', 'synonym'),
((SELECT id FROM glossary_terms WHERE standard_term = 'Bell Pepper' LIMIT 1), 'sweet pepper', 'synonym')
ON CONFLICT DO NOTHING;

-- Add more ingredients to the glossary from the CSV file
INSERT INTO glossary_terms (standard_term, term_type, description)
VALUES
  ('Eggs', 'ingredient', 'A versatile ingredient used in baking, cooking, and as a protein source'),
  ('Cheese', 'ingredient', 'A dairy product made from curdled milk, available in various types and flavors'),
  ('Pancetta', 'ingredient', 'Italian cured pork belly, often used in pasta dishes'),
  ('Chicken', 'ingredient', 'A common poultry meat used in a variety of cuisines'),
  ('Tomato', 'ingredient', 'A red fruit often used in sauces, salads, and cooking'),
  ('Beef', 'ingredient', 'A type of red meat from cattle, used in steaks, burgers, and stews'),
  ('Rice', 'ingredient', 'A staple grain used in many cuisines worldwide'),
  ('Noodles', 'ingredient', 'A type of pasta made from wheat, rice, or other grains'),
  ('Spinach', 'ingredient', 'A leafy green vegetable rich in iron and vitamins'),
  ('Garlic', 'ingredient', 'A pungent bulb used as a seasoning in cooking'),
  ('Onion', 'ingredient', 'A bulb vegetable used as a base in many dishes'),
  ('Milk', 'ingredient', 'A dairy product used in cooking, baking, and beverages'),
  ('Butter', 'ingredient', 'A dairy product made from churning cream, used in cooking and baking'),
  ('Flour', 'ingredient', 'A powder made from grinding grains, used in baking and cooking'),
  ('Carrot', 'ingredient', 'A root vegetable, often orange, used in salads, soups, and stews'),
  ('Potato', 'ingredient', 'A starchy tuber used in a variety of dishes'),
  ('Peas', 'ingredient', 'Small green legumes used in soups, stews, and side dishes'),
  ('Apple', 'ingredient', 'A sweet fruit often eaten raw or used in desserts'),
  ('Banana', 'ingredient', 'A tropical fruit with a sweet, creamy flesh'),
  ('Strawberry', 'ingredient', 'A red, juicy fruit often used in desserts and smoothies'),
  ('Blueberry', 'ingredient', 'A small, sweet blue fruit used in baking and snacks'),
  ('Orange', 'ingredient', 'A citrus fruit known for its sweet and tangy flavor'),
  ('Salmon', 'ingredient', 'A fatty fish rich in omega-3 fatty acids, often grilled or baked'),
  ('Tuna', 'ingredient', 'A type of fish used in salads, sandwiches, and sushi'),
  ('Avocado', 'ingredient', 'A creamy fruit often used in salads and guacamole'),
  ('Chili Pepper', 'ingredient', 'A spicy fruit used to add heat to dishes'),
  ('Garbanzo Beans', 'ingredient', 'Also known as chickpeas, used in hummus and stews'),
  ('Black Beans', 'ingredient', 'A type of legume used in soups, stews, and salads'),
  ('Corn', 'ingredient', 'A cereal grain used in cooking and as a vegetable'),
  ('Red Pepper', 'ingredient', 'A sweet or spicy pepper used in cooking'),
  ('Green Pepper', 'ingredient', 'A bell pepper with a mild flavor, used in salads and cooking'),
  ('Parsley', 'ingredient', 'A fresh herb used as a garnish or seasoning'),
  ('Basil', 'ingredient', 'A sweet herb often used in Italian dishes like pesto'),
  ('Thyme', 'ingredient', 'A versatile herb used in soups, stews, and roasts'),
  ('Oregano', 'ingredient', 'A herb with a robust flavor, commonly used in Italian and Greek cuisines'),
  ('Bay Leaf', 'ingredient', 'A leaf used to add flavor to soups and stews'),
  ('Artichoke', 'ingredient', 'A thistle vegetable with a tender heart and edible leaves'),
  ('Asparagus', 'ingredient', 'A green vegetable with a distinct flavor, often grilled or steamed'),
  ('Leek', 'ingredient', 'A mild-flavored member of the onion family'),
  ('Shallot', 'ingredient', 'A small, mild onion often used in gourmet cooking'),
  ('Celery', 'ingredient', 'A crunchy vegetable often used in soups and salads'),
  ('Zucchini', 'ingredient', 'A type of summer squash, often used in stir-fries and baking'),
  ('Pumpkin', 'ingredient', 'A large orange squash used in soups, pies, and decorations'),
  ('Sweet Potato', 'ingredient', 'A starchy root vegetable with a sweet flavor'),
  ('Broccoli', 'ingredient', 'A green vegetable with a tree-like structure, rich in nutrients'),
  ('Cauliflower', 'ingredient', 'A white vegetable similar to broccoli, often used as a low-carb substitute')
ON CONFLICT DO NOTHING;

-- Add more cuisines to the glossary
INSERT INTO glossary_terms (standard_term, term_type, description)
VALUES
  ('French', 'cuisine', 'Cuisine from France, known for pastries, cheeses, and fine dining'),
  ('Thai', 'cuisine', 'Cuisine from Thailand, known for its balance of sweet, sour, salty, and spicy flavors'),
  ('Spanish', 'cuisine', 'Cuisine from Spain, known for tapas, paella, and cured meats'),
  ('Greek', 'cuisine', 'Cuisine from Greece, known for olive oil, feta cheese, and fresh vegetables'),
  ('Middle Eastern', 'cuisine', 'Cuisine from the Middle East, known for spices, hummus, and kebabs'),
  ('American', 'cuisine', 'Cuisine from the United States, known for burgers, BBQ, and diverse influences'),
  ('British', 'cuisine', 'Cuisine from the United Kingdom, known for fish and chips and hearty pies'),
  ('Moroccan', 'cuisine', 'Cuisine from Morocco, known for tagines and couscous'),
  ('Jewish', 'cuisine', 'Cuisine from Jewish traditions, including challah and matzah ball soup'),
  ('European', 'cuisine', 'Cuisine from Europe, encompassing a wide variety of regional dishes')
ON CONFLICT DO NOTHING;

-- Ensure all required terms exist in the glossary_terms table
INSERT INTO glossary_terms (standard_term, term_type, description)
VALUES
  ('Indian', 'cuisine', 'Cuisine from India, known for its spices and diverse flavors'),
  ('Middle Eastern', 'cuisine', 'Cuisine from the Middle East, known for spices, hummus, and kebabs'),
  ('Italian', 'cuisine', 'Cuisine from Italy, known for pasta, pizza, and olive oil'),
  ('French', 'cuisine', 'Cuisine from France, known for pastries, cheeses, and fine dining'),
  ('American', 'cuisine', 'Cuisine from the United States, known for burgers, BBQ, and diverse influences'),
  ('Mexican', 'cuisine', 'Cuisine from Mexico, known for tacos, burritos, and spicy flavors')
ON CONFLICT DO NOTHING;

-- Add more related terms for cuisines and dishes
INSERT INTO glossary_related_terms (source_term_id, related_term_id, relation_type, strength)
VALUES
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Jewish' LIMIT 1), 
   (SELECT id FROM glossary_terms WHERE standard_term = 'Latkes' LIMIT 1), 
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Jewish' LIMIT 1), 
   (SELECT id FROM glossary_terms WHERE standard_term = 'Challah' LIMIT 1), 
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Jewish' LIMIT 1), 
   (SELECT id FROM glossary_terms WHERE standard_term = 'Matzah Ball Soup' LIMIT 1), 
   'includes_dish', 0.9)
ON CONFLICT DO NOTHING;

-- Ensure all required terms exist in the glossary_terms table
INSERT INTO glossary_terms (standard_term, term_type, description)
VALUES
  ('Hamburger', 'dish', 'A classic American sandwich made with a ground beef patty'),
  ('Fish and Chips', 'dish', 'A traditional British dish of fried fish and potatoes'),
  ('Lamb Tagine', 'dish', 'A Moroccan stew made with lamb and spices'),
  ('Rye Bread', 'dish', 'A type of bread made with rye flour')
ON CONFLICT DO NOTHING;

-- Add even more related terms for cuisines and dishes
INSERT INTO glossary_related_terms (source_term_id, related_term_id, relation_type, strength)
VALUES
  ((SELECT id FROM glossary_terms WHERE standard_term = 'American' LIMIT 1), 
   (SELECT id FROM glossary_terms WHERE standard_term = 'Hamburger' LIMIT 1), 
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'British' LIMIT 1), 
   (SELECT id FROM glossary_terms WHERE standard_term = 'Fish and Chips' LIMIT 1), 
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Moroccan' LIMIT 1), 
   (SELECT id FROM glossary_terms WHERE standard_term = 'Lamb Tagine' LIMIT 1), 
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Jewish' LIMIT 1), 
   (SELECT id FROM glossary_terms WHERE standard_term = 'Latkes' LIMIT 1), 
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'European' LIMIT 1), 
   (SELECT id FROM glossary_terms WHERE standard_term = 'Rye Bread' LIMIT 1), 
   'includes_dish', 0.9)
ON CONFLICT DO NOTHING;

-- Add bread category and types to the glossary
INSERT INTO glossary_terms (standard_term, term_type, description)
VALUES
  ('Bread', 'category', 'Staple food prepared from dough of flour and water'),
  ('Flatbread', 'dish', 'Bread made with flour, water, salt, and often yeast, that is flattened and baked'),
  ('Sourdough', 'dish', 'Bread made by the fermentation of dough using naturally occurring lactobacilli and yeast'),
  ('Naan', 'dish', 'Leavened, oven-baked flatbread found in the cuisines of Western Asia, Central Asia, and South Asia'),
  ('Pita', 'dish', 'A family of yeast-leavened round flatbreads baked from wheat flour'),
  ('Focaccia', 'dish', 'A flat oven-baked Italian bread similar to pizza dough'),
  ('Baguette', 'dish', 'A long, thin loaf of French bread with a crisp crust'),
  ('Ciabatta', 'dish', 'An Italian white bread made from wheat flour, water, salt, and yeast'),
  ('Brioche', 'dish', 'A French pastry-like bread with a high egg and butter content'),
  ('Bagel', 'dish', 'A dense bread roll in the shape of a ring, boiled before baking'),
  ('Cornbread', 'dish', 'Bread made with cornmeal, popular in American cuisine'),
  ('Roti', 'dish', 'Unleavened flatbread originating from the Indian subcontinent'),
  ('Tortilla', 'dish', 'Thin, unleavened flatbread made from corn or wheat flour')
ON CONFLICT DO NOTHING;

-- Add variants for bread types
INSERT INTO glossary_variants (glossary_term_id, variant_term, variant_type)
VALUES
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Flatbread' LIMIT 1), 'flat bread', 'synonym'),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Flatbread' LIMIT 1), 'flat-bread', 'synonym'),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Sourdough' LIMIT 1), 'sour dough', 'synonym'),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Sourdough' LIMIT 1), 'sour-dough', 'synonym'),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Naan' LIMIT 1), 'naan bread', 'synonym'),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Focaccia' LIMIT 1), 'focacia', 'misspelling'),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Baguette' LIMIT 1), 'french bread', 'synonym'),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Ciabatta' LIMIT 1), 'ciabata', 'misspelling'),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Cornbread' LIMIT 1), 'corn bread', 'synonym')
ON CONFLICT DO NOTHING;

-- Link bread types to the bread category
INSERT INTO glossary_related_terms (source_term_id, related_term_id, relation_type, strength)
VALUES
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Bread' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Flatbread' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Bread' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Sourdough' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Bread' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Naan' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Bread' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Pita' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Bread' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Focaccia' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Bread' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Baguette' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Bread' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Ciabatta' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Bread' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Brioche' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Bread' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Bagel' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Bread' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Cornbread' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Bread' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Roti' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Bread' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Tortilla' LIMIT 1),
   'includes_item', 0.9)
ON CONFLICT DO NOTHING;

-- Link bread types to cuisines
INSERT INTO glossary_related_terms (source_term_id, related_term_id, relation_type, strength)
VALUES
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Indian' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Naan' LIMIT 1),
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Middle Eastern' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Pita' LIMIT 1),
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Italian' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Focaccia' LIMIT 1),
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Italian' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Ciabatta' LIMIT 1),
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'French' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Baguette' LIMIT 1),
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'French' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Brioche' LIMIT 1),
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'American' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Cornbread' LIMIT 1),
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Indian' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Roti' LIMIT 1),
   'includes_dish', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Mexican' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Tortilla' LIMIT 1),
   'includes_dish', 0.9)
ON CONFLICT DO NOTHING;

-- Ensure the 'Dairy' term exists in the glossary_terms table
INSERT INTO glossary_terms (standard_term, term_type, description)
VALUES
  ('Dairy', 'category', 'A category for dairy products including milk, cheese, and butter')
ON CONFLICT DO NOTHING;

-- Add specific dairy-related ingredients to the glossary
INSERT INTO glossary_terms (standard_term, term_type, description)
VALUES
  ('Milk', 'ingredient', 'A dairy product used in cooking, baking, and beverages'),
  ('Cheese', 'ingredient', 'A dairy product made from curdled milk, available in various types and flavors'),
  ('Butter', 'ingredient', 'A dairy product made from churning cream, used in cooking and baking'),
  ('Cream', 'ingredient', 'A thick dairy product used in sauces and desserts'),
  ('Yogurt', 'ingredient', 'A fermented dairy product often used in cooking or as a snack'),
  ('Sour Cream', 'ingredient', 'A tangy dairy product used in dips and baking'),
  ('Ice Cream', 'ingredient', 'A frozen dairy dessert'),
  ('Whey', 'ingredient', 'A byproduct of cheese production, used in protein supplements'),
  ('Casein', 'ingredient', 'A protein found in milk, used in various food products'),
  ('Ghee', 'ingredient', 'Clarified butter used in Indian cooking')
ON CONFLICT DO NOTHING;

-- Link dairy-related ingredients to the 'dairy' category
INSERT INTO glossary_related_terms (source_term_id, related_term_id, relation_type, strength)
VALUES
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Dairy' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Milk' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Dairy' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Cheese' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Dairy' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Butter' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Dairy' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Cream' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Dairy' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Yogurt' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Dairy' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Sour Cream' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Dairy' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Ice Cream' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Dairy' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Whey' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Dairy' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Casein' LIMIT 1),
   'includes_item', 0.9),
  ((SELECT id FROM glossary_terms WHERE standard_term = 'Dairy' LIMIT 1),
   (SELECT id FROM glossary_terms WHERE standard_term = 'Ghee' LIMIT 1),
   'includes_item', 0.9)
ON CONFLICT DO NOTHING;