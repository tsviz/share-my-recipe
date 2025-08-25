-- Seed initial meal plans for user luna_chef
-- User ID: 550e8400-e29b-41d4-a716-446655440000
-- Recipes used: Spaghetti Carbonara (029db3d1-4f21-4e98-ab32-aef892d9fb73), Mushroom Risotto (10000000-0000-0000-0000-000000000001)

INSERT INTO meal_plans (id, user_id, name, start_date, end_date, total_calories)
VALUES ('11111111-1111-1111-1111-111111111111','550e8400-e29b-41d4-a716-446655440000','Italian Comfort Week','2025-08-25','2025-08-31',0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO meal_plans (id, user_id, name, start_date, end_date, total_calories)
VALUES ('22222222-2222-2222-2222-222222222222','550e8400-e29b-41d4-a716-446655440000','Quick Midweek Plan','2025-09-01','2025-09-03',0)
ON CONFLICT (id) DO NOTHING;

-- Italian Comfort Week items
INSERT INTO meal_plan_items (id, meal_plan_id, recipe_id, meal_date, meal_time, servings)
VALUES ('31111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','029db3d1-4f21-4e98-ab32-aef892d9fb73','2025-08-25','dinner',2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO meal_plan_items (id, meal_plan_id, recipe_id, meal_date, meal_time, servings)
VALUES ('31111111-1111-1111-1111-111111111112','11111111-1111-1111-1111-111111111111','10000000-0000-0000-0000-000000000001','2025-08-26','dinner',2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO meal_plan_items (id, meal_plan_id, recipe_id, meal_date, meal_time, servings)
VALUES ('31111111-1111-1111-1111-111111111113','11111111-1111-1111-1111-111111111111','029db3d1-4f21-4e98-ab32-aef892d9fb73','2025-08-28','lunch',1)
ON CONFLICT (id) DO NOTHING;

-- Quick Midweek Plan items
INSERT INTO meal_plan_items (id, meal_plan_id, recipe_id, meal_date, meal_time, servings)
VALUES ('32222222-2222-2222-2222-222222222221','22222222-2222-2222-2222-222222222222','10000000-0000-0000-0000-000000000001','2025-09-01','dinner',2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO meal_plan_items (id, meal_plan_id, recipe_id, meal_date, meal_time, servings)
VALUES ('32222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222','029db3d1-4f21-4e98-ab32-aef892d9fb73','2025-09-02','dinner',2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO meal_plan_items (id, meal_plan_id, recipe_id, meal_date, meal_time, servings)
VALUES ('32222222-2222-2222-2222-222222222223','22222222-2222-2222-2222-222222222222','10000000-0000-0000-0000-000000000001','2025-09-03','lunch',1)
ON CONFLICT (id) DO NOTHING;
