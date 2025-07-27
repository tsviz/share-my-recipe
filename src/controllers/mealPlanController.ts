// src/controllers/mealPlanController.ts
// Controller functions for meal planning feature
import { Request, Response } from 'express';
import { Pool } from 'pg';
import { MealPlan, MealPlanItem, ShoppingList, ShoppingListItem } from '../models/mealPlan';

// Pool should be passed in from main app
let pool: Pool;
export function setPool(p: Pool) { pool = p; }

export async function getMealPlans(req: Request, res: Response) {
  const userId = (req.user as any).id;
  try {
    const result = await pool.query('SELECT * FROM meal_plans WHERE user_id = $1 ORDER BY start_date DESC', [userId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch meal plans' });
  }
}

export async function getMealPlan(req: Request, res: Response) {
  const userId = (req.user as any).id;
  const { id } = req.params;
  try {
    const planResult = await pool.query('SELECT * FROM meal_plans WHERE id = $1 AND user_id = $2', [id, userId]);
    if (planResult.rows.length === 0) return res.status(404).json({ error: 'Meal plan not found' });
    const itemsResult = await pool.query('SELECT * FROM meal_plan_items WHERE meal_plan_id = $1', [id]);
    const items = itemsResult.rows;

    // For each meal plan item, calculate calories per serving
    for (const item of items) {
      // Get all ingredients for the recipe, with quantity and unit
      const recipeIngredientsResult = await pool.query(
        `SELECT ri.ingredient_id, ri.quantity, ri.unit, i.calories_per_100g
         FROM recipe_ingredients ri
         JOIN ingredients i ON ri.ingredient_id = i.id
         WHERE ri.recipe_id = $1`,
        [item.recipe_id]
      );
      let totalCalories = 0;
      for (const ri of recipeIngredientsResult.rows) {
        // Parse quantity and unit (e.g., "1 lb", "2 tbsp", "100 g")
        let qty = 1;
        let unit = 'g';
        if (ri.quantity) {
          // Try to extract numeric value and unit
          const match = String(ri.quantity).match(/([\d\.\/]+)\s*(\w+)?/);
          if (match) {
            // Handle fractions like "1/2"
            if (match[1].includes('/')) {
              const [num, denom] = match[1].split('/').map(Number);
              qty = denom ? num / denom : 1;
            } else {
              qty = parseFloat(match[1]);
            }
            if (match[2]) unit = match[2].toLowerCase();
          }
        }
        // Convert to grams if possible (simple mapping, can be extended)
        let grams = qty;
        if (unit === 'g' || unit === 'gram' || unit === 'grams') {
          grams = qty;
        } else if (unit === 'kg' || unit === 'kilogram' || unit === 'kilograms') {
          grams = qty * 1000;
        } else if (unit === 'mg') {
          grams = qty / 1000;
        } else if (unit === 'lb' || unit === 'lbs' || unit === 'pound' || unit === 'pounds') {
          grams = qty * 453.592;
        } else if (unit === 'oz' || unit === 'ounce' || unit === 'ounces') {
          grams = qty * 28.3495;
        } else if (unit === 'cup' || unit === 'cups') {
          // Approximate: 1 cup = 240g (varies by ingredient)
          grams = qty * 240;
        } else if (unit === 'tbsp' || unit === 'tablespoon' || unit === 'tablespoons') {
          grams = qty * 15;
        } else if (unit === 'tsp' || unit === 'teaspoon' || unit === 'teaspoons') {
          grams = qty * 5;
        } // else: fallback, treat as grams

        // Calculate calories for this ingredient
        if (ri.calories_per_100g) {
          totalCalories += (grams / 100) * parseFloat(ri.calories_per_100g);
        }
      }
      // Per-serving calories
      const servings = item.servings || 1;
      item.total_calories = Math.round(totalCalories);
      item.calories_per_serving = Math.round(totalCalories / servings);
    }
    res.json({ ...planResult.rows[0], items });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch meal plan' });
  }
}

export async function createMealPlan(req: Request, res: Response) {
  const userId = (req.user as any).id;
  const { name, start_date, end_date } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO meal_plans (id, user_id, name, start_date, end_date) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING *',
      [userId, name, start_date, end_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create meal plan' });
  }
}

export async function updateMealPlan(req: Request, res: Response) {
  const userId = (req.user as any).id;
  const { id } = req.params;
  const { name, start_date, end_date } = req.body;
  try {
    const result = await pool.query(
      'UPDATE meal_plans SET name = $1, start_date = $2, end_date = $3, updated_at = now() WHERE id = $4 AND user_id = $5 RETURNING *',
      [name, start_date, end_date, id, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Meal plan not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update meal plan' });
  }
}

export async function deleteMealPlan(req: Request, res: Response) {
  const userId = (req.user as any).id;
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM meal_plans WHERE id = $1 AND user_id = $2', [id, userId]);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete meal plan' });
  }
}
