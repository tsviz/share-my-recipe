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
      
      // Debug: Check if we can get basic meal plan items
      const checkBasic = await pool.query(`
        SELECT mpi.id, mpi.recipe_id FROM meal_plan_items mpi 
        WHERE mpi.meal_plan_id = $1 LIMIT 5
      `, [mealPlanId]);
      console.log(`Debug - First few meal plan items:`, checkBasic.rows);
      
      // If we have meal plan items, check if they have recipe ingredients
      if (checkBasic.rows.length > 0) {
        const recipeId = checkBasic.rows[0].recipe_id;
        const checkIngredients = await pool.query(`
          SELECT ri.recipe_id, ri.ingredient_id, ri.quantity, i.name
          FROM recipe_ingredients ri
          JOIN ingredients i ON ri.ingredient_id = i.id
          WHERE ri.recipe_id = $1
          LIMIT 5
        `, [recipeId]);
        console.log(`Debug - Recipe ${recipeId} ingredients:`, checkIngredients.rows);
      }
      
      // Get comprehensive sample data to help with debugging
      try {
        const sampleData = await pool.query(`
          SELECT ri.quantity, i.name, ri.recipe_id
          FROM meal_plan_items mpi
          JOIN recipe_ingredients ri ON mpi.recipe_id = ri.recipe_id
          JOIN ingredients i ON ri.ingredient_id = i.id
          WHERE mpi.meal_plan_id = $1
          ORDER BY ri.quantity IS NULL, random()
          LIMIT 15
        `, [mealPlanId]);
        
        if (sampleData.rows.length > 0) {
          console.log('Sample ingredient entries:', sampleData.rows.map(r => ({
            ingredient: r.name,
            recipe_id: r.recipe_id,
            quantity: r.quantity,
            extracted_unit: r.quantity ? 
              r.quantity.replace(/^[0-9\s\.\-/]+/, '').replace(/[^a-zA-Z\s]/g, '') : '',
            simple_extract: r.quantity && typeof r.quantity === 'string' && r.quantity.match(/[a-zA-Z]+/) ? 
              r.quantity.match(/[a-zA-Z]+/)[0] : ''
          })));
        } else {
          console.log('No sample ingredient entries found');
        }
      } catch (sampleError: any) {
        console.warn('Could not get sample data:', sampleError.message || sampleError);
        // Continue with main query - this is just for debugging
      }
      
      // Use a corrected query with proper aggregation for unit extraction
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
          -- Extract unit using string_agg to aggregate units from multiple matching ingredients
          -- We take the first non-empty unit we find for each ingredient group
          COALESCE(
            string_agg(
              CASE
                WHEN ri.quantity IS NULL THEN NULL
                WHEN ri.quantity ~ '[a-zA-Z]' THEN TRIM(REGEXP_REPLACE(ri.quantity, '^[0-9\\s\\.\\-/]+', '', 'g'))
                ELSE NULL
              END,
              ',' ORDER BY ri.quantity IS NOT NULL DESC, char_length(ri.quantity) DESC
            ),
            ''
          ) AS unit
        FROM meal_plan_items mpi
        LEFT JOIN recipe_ingredients ri ON mpi.recipe_id = ri.recipe_id
        LEFT JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE mpi.meal_plan_id = $1
          AND i.name IS NOT NULL
        GROUP BY i.name
        ORDER BY i.name
      `, [mealPlanId]);
      
      res.json(result.rows);
    } catch (queryError: any) {
      console.error('SQL Error in shopping list generation:', queryError.message || queryError);
      console.error('Query error details:', queryError);
      
      // Try a simpler fallback with basic unit extraction
      try {
        console.log('Attempting fallback shopping list query with simplified approach...');
        const fallbackResult = await pool.query(`
          SELECT 
            i.name, 
            SUM(mpi.servings) AS total_quantity,
            -- Use string_agg to properly handle quantity in GROUP BY context
            -- This will take the first non-empty quantity string for each ingredient group
            COALESCE(
              string_agg(
                CASE WHEN ri.quantity IS NOT NULL THEN ri.quantity ELSE NULL END,
                ',' ORDER BY ri.quantity IS NOT NULL DESC, char_length(ri.quantity) DESC
              ),
              ''
            ) AS unit
          FROM meal_plan_items mpi
          LEFT JOIN recipe_ingredients ri ON mpi.recipe_id = ri.recipe_id
          LEFT JOIN ingredients i ON ri.ingredient_id = i.id
          WHERE mpi.meal_plan_id = $1
            AND i.name IS NOT NULL
          GROUP BY i.name
          ORDER BY i.name
        `, [mealPlanId]);
        
        console.log('Fallback query succeeded');
        return res.json(fallbackResult.rows);
      } catch (fallbackError: any) {
        console.error('Fallback SQL Error:', fallbackError.message || fallbackError);
        
        // Try one last ultra-simple fallback with no regex at all
        try {
          console.log('Attempting ultra-simple fallback query with no regex...');
          const simpleResult = await pool.query(`
            SELECT 
              i.name, 
              SUM(mpi.servings) AS total_quantity,
              '' AS unit
            FROM meal_plan_items mpi
            JOIN recipe_ingredients ri ON mpi.recipe_id = ri.recipe_id
            JOIN ingredients i ON ri.ingredient_id = i.id
            WHERE mpi.meal_plan_id = $1
            GROUP BY i.name
            ORDER BY i.name
          `, [mealPlanId]);
          
          console.log('Ultra-simple fallback query succeeded');
          return res.json(simpleResult.rows);
        } catch (finalError: any) {
          console.error('Final fallback failed:', finalError.message || finalError);
          // Return the error with a clearer message rather than throwing
          return res.status(500).json({ 
            error: 'Failed to generate shopping list', 
            details: finalError.message || 'Database query error'
          });
        }
      }
    }
  } catch (error: any) {
    console.error('Error generating shopping list:', error.message || error);
    console.error('Error stack:', error.stack || 'No stack trace available');
    res.status(500).json({ 
      error: 'Failed to generate shopping list',
      details: error.message || 'Unknown error occurred'
    });
  }
}
