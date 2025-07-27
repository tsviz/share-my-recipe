// src/controllers/mealPlanItemController.ts
import { Request, Response } from 'express';
import { Pool } from 'pg';

let pool: Pool;
export function setPool(p: Pool) { pool = p; }

export async function getMealPlanItems(req: Request, res: Response) {
  const userId = (req.user as any).id;
  const { mealPlanId } = req.params;
  try {
    // Ensure user owns the meal plan
    const plan = await pool.query('SELECT id FROM meal_plans WHERE id = $1 AND user_id = $2', [mealPlanId, userId]);
    if (plan.rows.length === 0) return res.status(404).json({ error: 'Meal plan not found' });
    const itemsResult = await pool.query('SELECT * FROM meal_plan_items WHERE meal_plan_id = $1 ORDER BY meal_date, meal_time', [mealPlanId]);
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
    // Debug: Log the items array with calories before sending response
    console.log('[MealPlanItems] Returning items:', JSON.stringify(items, null, 2));
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch meal plan items' });
  }
}

export async function addMealPlanItem(req: Request, res: Response) {
  const userId = (req.user as any).id;
  const { mealPlanId } = req.params;
  const { recipe_id, meal_date, meal_time, servings } = req.body;
  try {
    // Ensure user owns the meal plan and get plan date range
    const plan = await pool.query('SELECT id, start_date, end_date FROM meal_plans WHERE id = $1 AND user_id = $2', [mealPlanId, userId]);
    if (plan.rows.length === 0) return res.status(404).json({ error: 'Meal plan not found' });
    
    // Validate that the meal date is within the plan's date range
    // Use YYYY-MM-DD string comparison to avoid time zone issues
    const startDateStr = new Date(plan.rows[0].start_date).toISOString().split('T')[0];
    const endDateStr = new Date(plan.rows[0].end_date).toISOString().split('T')[0];
    const mealDateStr = new Date(meal_date).toISOString().split('T')[0];
    
    if (mealDateStr < startDateStr || mealDateStr > endDateStr) {
      return res.status(400).json({ 
        error: 'Invalid meal date',
        details: `The meal date must be between ${startDateStr} and ${endDateStr}`
      });
    }
    
    const result = await pool.query(
      'INSERT INTO meal_plan_items (id, meal_plan_id, recipe_id, meal_date, meal_time, servings) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING *',
      [mealPlanId, recipe_id, meal_date, meal_time, servings || 1]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add meal plan item' });
  }
}

export async function updateMealPlanItem(req: Request, res: Response) {
  const userId = (req.user as any).id;
  const { mealPlanId, itemId } = req.params;
  const { recipe_id, meal_date, meal_time, servings } = req.body;
  try {
    // Ensure user owns the meal plan and get plan date range
    const plan = await pool.query('SELECT id, start_date, end_date FROM meal_plans WHERE id = $1 AND user_id = $2', [mealPlanId, userId]);
    if (plan.rows.length === 0) return res.status(404).json({ error: 'Meal plan not found' });
    
    // Validate that the meal date is within the plan's date range
    // Use YYYY-MM-DD string comparison to avoid time zone issues
    const startDateStr = new Date(plan.rows[0].start_date).toISOString().split('T')[0];
    const endDateStr = new Date(plan.rows[0].end_date).toISOString().split('T')[0];
    const mealDateStr = new Date(meal_date).toISOString().split('T')[0];
    
    if (mealDateStr < startDateStr || mealDateStr > endDateStr) {
      return res.status(400).json({ 
        error: 'Invalid meal date',
        details: `The meal date must be between ${startDateStr} and ${endDateStr}`
      });
    }
    
    const result = await pool.query(
      'UPDATE meal_plan_items SET recipe_id = $1, meal_date = $2, meal_time = $3, servings = $4, updated_at = now() WHERE id = $5 AND meal_plan_id = $6 RETURNING *',
      [recipe_id, meal_date, meal_time, servings, itemId, mealPlanId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Meal plan item not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update meal plan item' });
  }
}

export async function deleteMealPlanItem(req: Request, res: Response) {
  const userId = (req.user as any).id;
  const { mealPlanId, itemId } = req.params;
  try {
    // Ensure user owns the meal plan
    const plan = await pool.query('SELECT id FROM meal_plans WHERE id = $1 AND user_id = $2', [mealPlanId, userId]);
    if (plan.rows.length === 0) return res.status(404).json({ error: 'Meal plan not found' });
    await pool.query('DELETE FROM meal_plan_items WHERE id = $1 AND meal_plan_id = $2', [itemId, mealPlanId]);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete meal plan item' });
  }
}
