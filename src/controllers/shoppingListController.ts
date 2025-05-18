// src/controllers/shoppingListController.ts
import { Request, Response } from 'express';
import { Pool } from 'pg';

let pool: Pool;
export function setPool(p: Pool) { pool = p; }

// Generate a shopping list for a meal plan (aggregate ingredients)
export async function generateShoppingList(req: Request, res: Response) {
  const userId = (req.user as any).id;
  const { mealPlanId } = req.params;
  console.log(`Starting shopping list generation for meal plan ID: ${mealPlanId}, user ID: ${userId}`);
  
  try {
    // Ensure user owns the meal plan
    console.log('Verifying meal plan ownership...');
    const plan = await pool.query('SELECT id FROM meal_plans WHERE id = $1 AND user_id = $2', [mealPlanId, userId]);
    if (plan.rows.length === 0) {
      console.log('Meal plan not found or user does not have access');
      return res.status(404).json({ error: 'Meal plan not found' });
    }
    console.log('Meal plan ownership verified');
    
    // Check if there are any meal plan items
    const itemsCheck = await pool.query('SELECT COUNT(*) as count FROM meal_plan_items WHERE meal_plan_id = $1', [mealPlanId]);
    if (parseInt(itemsCheck.rows[0].count) === 0) {
      return res.status(200).json([]); // Return empty array if no items
    }
    
    // Add error logging
    console.log(`Generating shopping list for meal plan ID: ${mealPlanId}`);
    
    try {
      // First verify all tables and relationships exist
      const checkRecipes = await pool.query(`
        SELECT COUNT(*) FROM meal_plan_items mpi 
        WHERE mpi.meal_plan_id = $1
      `, [mealPlanId]);
      
      console.log(`Found ${checkRecipes.rows[0].count} meal plan items`);
      
      // Aggregate ingredients from all recipes in the meal plan
      // Safe approach with LEFT JOINS to prevent missing records from breaking the query
      // Modified to handle all types of quantity values and conversions safely
      const result = await pool.query(`
        SELECT 
          i.name, 
          SUM(CASE 
            WHEN ri.quantity IS NULL THEN mpi.servings::float
            WHEN ri.quantity ~ '^[0-9]+(\\.[0-9]+)?$' THEN ri.quantity::float * mpi.servings 
            WHEN ri.quantity ~ '^[0-9]+/[0-9]+$' THEN 
              (split_part(ri.quantity, '/', 1)::float / 
               NULLIF(split_part(ri.quantity, '/', 2)::float, 0)) * mpi.servings
            ELSE mpi.servings::float
          END) AS total_quantity,
          '' AS unit
        FROM meal_plan_items mpi
        LEFT JOIN recipe_ingredients ri ON mpi.recipe_id = ri.recipe_id
        LEFT JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE mpi.meal_plan_id = $1
          AND i.name IS NOT NULL
        GROUP BY i.name
        ORDER BY i.name
      `, [mealPlanId]);
      
      res.json(result.rows);
    } catch (queryError) {
      console.error('SQL Error in shopping list generation:', queryError);
      throw queryError;
    }
  } catch (error) {
    console.error('Error generating shopping list:', error);
    res.status(500).json({ error: 'Failed to generate shopping list' });
  }
}
