-- Liquibase formatted SQL
-- changeset yourname:add-popularity-column
ALTER TABLE recipes ADD COLUMN popularity INT DEFAULT 0;