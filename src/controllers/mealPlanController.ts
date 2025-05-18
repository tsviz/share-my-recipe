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
    res.json({ ...planResult.rows[0], items: itemsResult.rows });
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
