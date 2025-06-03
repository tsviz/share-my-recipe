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
    const items = await pool.query('SELECT * FROM meal_plan_items WHERE meal_plan_id = $1 ORDER BY meal_date, meal_time', [mealPlanId]);
    res.json(items.rows);
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
