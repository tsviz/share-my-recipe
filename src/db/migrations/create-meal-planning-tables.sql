-- Liquibase migration for meal planning feature
-- Adds meal_plans, meal_plan_items, shopping_lists, shopping_list_items

-- Table: meal_plans
CREATE TABLE meal_plans (
    id character varying PRIMARY KEY,
    user_id character varying NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name character varying NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    total_calories integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- Table: meal_plan_items
CREATE TABLE meal_plan_items (
    id character varying PRIMARY KEY,
    meal_plan_id character varying NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    recipe_id character varying NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    meal_date date NOT NULL,
    meal_time character varying NOT NULL, -- e.g., 'breakfast', 'lunch', 'dinner'
    servings integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- Table: shopping_lists
CREATE TABLE shopping_lists (
    id character varying PRIMARY KEY,
    meal_plan_id character varying NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    name character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- Table: shopping_list_items
CREATE TABLE shopping_list_items (
    id character varying PRIMARY KEY,
    shopping_list_id character varying NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    ingredient_id character varying NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity character varying NOT NULL,
    unit character varying,
    checked boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_meal_plans_user_id ON meal_plans(user_id);
CREATE INDEX idx_meal_plan_items_meal_plan_id ON meal_plan_items(meal_plan_id);
CREATE INDEX idx_meal_plan_items_recipe_id ON meal_plan_items(recipe_id);
CREATE INDEX idx_shopping_lists_meal_plan_id ON shopping_lists(meal_plan_id);
CREATE INDEX idx_shopping_list_items_shopping_list_id ON shopping_list_items(shopping_list_id);
CREATE INDEX idx_shopping_list_items_ingredient_id ON shopping_list_items(ingredient_id);
