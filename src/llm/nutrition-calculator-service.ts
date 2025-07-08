import { Pool } from 'pg';
import { LocalAIClient } from './localai-client';

export interface NutritionData {
  recipeId: string;
  servingSize: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  cholesterol?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  potassium?: number;
  dataSource?: string;
  confidenceScore?: number;
}

export interface IngredientNutrition {
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Service for calculating nutritional information for recipes using AI
 */
export class NutritionCalculatorService {
  private pool: Pool;
  private aiClient: LocalAIClient;
  private cache: Map<string, NutritionData> = new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(pool: Pool) {
    this.pool = pool;
    this.aiClient = new LocalAIClient();
  }

  /**
   * Calculate nutrition for a recipe by recipe ID
   */
  public async calculateNutritionForRecipe(recipeId: string): Promise<NutritionData | null> {
    try {
      // Check cache first
      const cached = this.getCachedNutrition(recipeId);
      if (cached) {
        return cached;
      }

      // Check if nutrition already exists in database
      const existingResult = await this.pool.query(
        'SELECT * FROM recipe_nutrition WHERE recipe_id = $1',
        [recipeId]
      );

      if (existingResult.rows.length > 0) {
        const nutrition = this.mapDbToNutrition(existingResult.rows[0]);
        this.setCachedNutrition(recipeId, nutrition);
        return nutrition;
      }

      // Get recipe details
      const recipeResult = await this.pool.query(`
        SELECT r.title, r.description, r.instructions
        FROM recipes r
        WHERE r.id = $1
      `, [recipeId]);

      if (recipeResult.rows.length === 0) {
        throw new Error('Recipe not found');
      }

      const recipe = recipeResult.rows[0];

      // Get ingredients
      const ingredientsResult = await this.pool.query(`
        SELECT i.name, ri.quantity
        FROM recipe_ingredients ri
        JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE ri.recipe_id = $1
      `, [recipeId]);

      const ingredients = ingredientsResult.rows;

      // Calculate nutrition using AI
      const nutrition = await this.calculateNutritionWithAI(recipe, ingredients);
      
      if (nutrition) {
        // Save to database
        await this.saveNutritionToDatabase(recipeId, nutrition);
        
        // Update recipe flag
        await this.pool.query(
          'UPDATE recipes SET nutrition_calculated = true WHERE id = $1',
          [recipeId]
        );

        // Cache the result
        this.setCachedNutrition(recipeId, nutrition);
        
        return nutrition;
      }

      return null;
    } catch (error) {
      console.error('Error calculating nutrition for recipe:', error);
      return null;
    }
  }

  /**
   * Calculate nutrition using AI for recipe ingredients
   */
  private async calculateNutritionWithAI(recipe: any, ingredients: any[]): Promise<NutritionData | null> {
    try {
      const ingredientsList = ingredients.map(ing => `${ing.quantity || '1 unit'} ${ing.name}`).join(', ');
      
      const prompt = `Analyze the nutritional content of this recipe and provide detailed nutritional information per serving.

Recipe: ${recipe.title}
Description: ${recipe.description || 'No description'}
Ingredients: ${ingredientsList}

Please provide the nutritional information per serving in the following JSON format (use reasonable estimates based on standard nutritional databases):

{
  "servingSize": 1,
  "calories": 0,
  "protein": 0,
  "carbs": 0,
  "fat": 0,
  "fiber": 0,
  "sugar": 0,
  "sodium": 0,
  "cholesterol": 0,
  "vitamin_c": 0,
  "calcium": 0,
  "iron": 0,
  "potassium": 0,
  "confidenceScore": 0.8
}

Return only the JSON object with nutritional values in grams (except calories which is in kcal and vitamins/minerals in mg). Be conservative with estimates.`;

      const response = await this.aiClient.generateCompletion(prompt, {
        temperature: 0.3,
        max_tokens: 500
      });

      if (response) {
        return this.parseNutritionResponse(response);
      }

      return null;
    } catch (error) {
      console.error('Error calculating nutrition with AI:', error);
      return null;
    }
  }

  /**
   * Parse AI response for nutrition data
   */
  private parseNutritionResponse(response: string): NutritionData | null {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        console.error('No JSON found in AI response');
        return null;
      }

      const nutritionData = JSON.parse(jsonMatch[0]);

      // Validate and clean the data
      return {
        recipeId: '', // Will be set by caller
        servingSize: nutritionData.servingSize || 1,
        calories: this.parseNumber(nutritionData.calories),
        protein: this.parseNumber(nutritionData.protein),
        carbs: this.parseNumber(nutritionData.carbs),
        fat: this.parseNumber(nutritionData.fat),
        fiber: this.parseNumber(nutritionData.fiber),
        sugar: this.parseNumber(nutritionData.sugar),
        sodium: this.parseNumber(nutritionData.sodium),
        cholesterol: this.parseNumber(nutritionData.cholesterol),
        vitamin_c: this.parseNumber(nutritionData.vitamin_c),
        calcium: this.parseNumber(nutritionData.calcium),
        iron: this.parseNumber(nutritionData.iron),
        potassium: this.parseNumber(nutritionData.potassium),
        dataSource: 'AI_CALCULATED',
        confidenceScore: this.parseNumber(nutritionData.confidenceScore) || 0.75
      };
    } catch (error) {
      console.error('Error parsing nutrition response:', error);
      return null;
    }
  }

  /**
   * Save nutrition data to database
   */
  private async saveNutritionToDatabase(recipeId: string, nutrition: NutritionData): Promise<void> {
    await this.pool.query(`
      INSERT INTO recipe_nutrition (
        recipe_id, serving_size, calories, protein, carbs, fat, fiber, sugar,
        sodium, cholesterol, vitamin_c, calcium, iron, potassium, data_source, confidence_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (recipe_id) DO UPDATE SET
        serving_size = EXCLUDED.serving_size,
        calories = EXCLUDED.calories,
        protein = EXCLUDED.protein,
        carbs = EXCLUDED.carbs,
        fat = EXCLUDED.fat,
        fiber = EXCLUDED.fiber,
        sugar = EXCLUDED.sugar,
        sodium = EXCLUDED.sodium,
        cholesterol = EXCLUDED.cholesterol,
        vitamin_c = EXCLUDED.vitamin_c,
        calcium = EXCLUDED.calcium,
        iron = EXCLUDED.iron,
        potassium = EXCLUDED.potassium,
        data_source = EXCLUDED.data_source,
        confidence_score = EXCLUDED.confidence_score,
        calculated_at = CURRENT_TIMESTAMP
    `, [
      recipeId,
      nutrition.servingSize,
      nutrition.calories,
      nutrition.protein,
      nutrition.carbs,
      nutrition.fat,
      nutrition.fiber,
      nutrition.sugar,
      nutrition.sodium,
      nutrition.cholesterol,
      nutrition.vitamin_c,
      nutrition.calcium,
      nutrition.iron,
      nutrition.potassium,
      nutrition.dataSource,
      nutrition.confidenceScore
    ]);
  }

  /**
   * Get nutrition data for a recipe from database
   */
  public async getNutritionForRecipe(recipeId: string): Promise<NutritionData | null> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM recipe_nutrition WHERE recipe_id = $1',
        [recipeId]
      );

      if (result.rows.length > 0) {
        return this.mapDbToNutrition(result.rows[0]);
      }

      return null;
    } catch (error) {
      console.error('Error getting nutrition for recipe:', error);
      return null;
    }
  }

  /**
   * Scale nutrition data for different serving sizes
   */
  public scaleNutrition(nutrition: NutritionData, newServingSize: number): NutritionData {
    const scale = newServingSize / nutrition.servingSize;
    
    return {
      ...nutrition,
      servingSize: newServingSize,
      calories: nutrition.calories ? Math.round(nutrition.calories * scale) : undefined,
      protein: nutrition.protein ? Math.round(nutrition.protein * scale * 10) / 10 : undefined,
      carbs: nutrition.carbs ? Math.round(nutrition.carbs * scale * 10) / 10 : undefined,
      fat: nutrition.fat ? Math.round(nutrition.fat * scale * 10) / 10 : undefined,
      fiber: nutrition.fiber ? Math.round(nutrition.fiber * scale * 10) / 10 : undefined,
      sugar: nutrition.sugar ? Math.round(nutrition.sugar * scale * 10) / 10 : undefined,
      sodium: nutrition.sodium ? Math.round(nutrition.sodium * scale * 10) / 10 : undefined,
      cholesterol: nutrition.cholesterol ? Math.round(nutrition.cholesterol * scale * 10) / 10 : undefined,
      vitamin_c: nutrition.vitamin_c ? Math.round(nutrition.vitamin_c * scale * 10) / 10 : undefined,
      calcium: nutrition.calcium ? Math.round(nutrition.calcium * scale * 10) / 10 : undefined,
      iron: nutrition.iron ? Math.round(nutrition.iron * scale * 10) / 10 : undefined,
      potassium: nutrition.potassium ? Math.round(nutrition.potassium * scale * 10) / 10 : undefined
    };
  }

  /**
   * Helper methods
   */
  private parseNumber(value: any): number | undefined {
    const num = parseFloat(value);
    return isNaN(num) ? undefined : Math.round(num * 100) / 100;
  }

  private mapDbToNutrition(row: any): NutritionData {
    return {
      recipeId: row.recipe_id,
      servingSize: row.serving_size,
      calories: row.calories,
      protein: row.protein,
      carbs: row.carbs,
      fat: row.fat,
      fiber: row.fiber,
      sugar: row.sugar,
      sodium: row.sodium,
      cholesterol: row.cholesterol,
      vitamin_c: row.vitamin_c,
      calcium: row.calcium,
      iron: row.iron,
      potassium: row.potassium,
      dataSource: row.data_source,
      confidenceScore: row.confidence_score
    };
  }

  private getCachedNutrition(recipeId: string): NutritionData | null {
    return this.cache.get(recipeId) || null;
  }

  private setCachedNutrition(recipeId: string, nutrition: NutritionData): void {
    this.cache.set(recipeId, { ...nutrition, recipeId });
    
    // Clean cache periodically
    if (this.cache.size > 1000) {
      const keys = Array.from(this.cache.keys());
      const oldestKeys = keys.slice(0, 200);
      oldestKeys.forEach(key => this.cache.delete(key));
    }
  }
}