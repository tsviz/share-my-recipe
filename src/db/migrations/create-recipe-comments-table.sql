-- Migration: Create recipe_comments table for comments and ratings
CREATE TABLE IF NOT EXISTS recipe_comments (
    id SERIAL PRIMARY KEY,
    recipe_id VARCHAR NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Optional: Index for faster lookups by recipe
CREATE INDEX IF NOT EXISTS idx_recipe_comments_recipe_id ON recipe_comments(recipe_id);
-- Optional: Index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_recipe_comments_user_id ON recipe_comments(user_id);
-- Optional: Prevent duplicate ratings/comments by the same user on the same recipe
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_recipe_comment ON recipe_comments(user_id, recipe_id);
