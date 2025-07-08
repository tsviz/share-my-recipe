import { Pool } from 'pg';
import { NutritionCalculatorService, NutritionData } from '../src/llm/nutrition-calculator-service';

jest.mock('pg', () => {
  const query = jest.fn();
  const mockPool = {
    query,
  };
  return { Pool: jest.fn(() => mockPool) };
});

// Mock the LocalAIClient
jest.mock('../src/llm/localai-client', () => {
  return {
    LocalAIClient: jest.fn().mockImplementation(() => ({
      generateCompletion: jest.fn()
    }))
  };
});

const mockPool = new Pool() as unknown as Pool & {
  query: jest.Mock;
};

describe('NutritionCalculatorService', () => {
  let nutritionService: NutritionCalculatorService;
  let mockAIClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    nutritionService = new NutritionCalculatorService(mockPool);
    // Get the mocked AI client instance
    mockAIClient = (nutritionService as any).aiClient;
  });

  describe('calculateNutritionForRecipe', () => {
    const mockRecipeId = 'recipe-123';
    const mockRecipe = {
      title: 'Test Recipe',
      description: 'A delicious test recipe',
      instructions: 'Mix and cook'
    };
    const mockIngredients = [
      { name: 'flour', quantity: '2 cups' },
      { name: 'eggs', quantity: '3 large' },
      { name: 'milk', quantity: '1 cup' }
    ];

    it('should calculate nutrition for a recipe with valid ingredients', async () => {
      // Mock database responses
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // No existing nutrition
        .mockResolvedValueOnce({ rows: [mockRecipe] }) // Recipe details
        .mockResolvedValueOnce({ rows: mockIngredients }) // Ingredients
        .mockResolvedValueOnce({}); // Save nutrition
      
      // Mock AI response
      const mockAIResponse = `{
        "servingSize": 4,
        "calories": 250,
        "protein": 8.5,
        "carbs": 45.2,
        "fat": 5.1,
        "fiber": 2.3,
        "sugar": 3.4,
        "sodium": 200,
        "cholesterol": 95,
        "vitamin_c": 0,
        "calcium": 120,
        "iron": 2.4,
        "potassium": 150,
        "confidenceScore": 0.85
      }`;
      
      mockAIClient.generateCompletion.mockResolvedValue(mockAIResponse);

      const result = await nutritionService.calculateNutritionForRecipe(mockRecipeId);

      expect(result).toBeTruthy();
      expect(result?.calories).toBe(250);
      expect(result?.protein).toBe(8.5);
      expect(result?.servingSize).toBe(4);
      expect(result?.confidenceScore).toBe(0.85);
      
      // Verify database calls
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM recipe_nutrition WHERE recipe_id = $1',
        [mockRecipeId]
      );
      
      // Verify AI was called with proper prompt
      expect(mockAIClient.generateCompletion).toHaveBeenCalled();
    });

    it('should return existing nutrition if already calculated', async () => {
      const existingNutrition = {
        recipe_id: mockRecipeId,
        serving_size: 2,
        calories: 300,
        protein: 10,
        carbs: 40,
        fat: 8,
        fiber: 3,
        sugar: 5,
        sodium: 250,
        cholesterol: 100,
        vitamin_c: 2,
        calcium: 150,
        iron: 3,
        potassium: 200,
        data_source: 'AI_CALCULATED',
        confidence_score: 0.8
      };

      mockPool.query.mockResolvedValueOnce({ rows: [existingNutrition] });

      const result = await nutritionService.calculateNutritionForRecipe(mockRecipeId);

      expect(result).toBeTruthy();
      expect(result?.calories).toBe(300);
      expect(result?.recipeId).toBe(mockRecipeId);
      
      // Should not call AI if nutrition already exists
      expect(mockAIClient.generateCompletion).not.toHaveBeenCalled();
    });

    it('should handle recipe not found', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // No existing nutrition
        .mockResolvedValueOnce({ rows: [] }); // No recipe found

      const result = await nutritionService.calculateNutritionForRecipe(mockRecipeId);

      expect(result).toBeNull();
    });

    it('should handle AI service errors gracefully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // No existing nutrition
        .mockResolvedValueOnce({ rows: [mockRecipe] }) // Recipe details
        .mockResolvedValueOnce({ rows: mockIngredients }); // Ingredients

      mockAIClient.generateCompletion.mockRejectedValue(new Error('AI service unavailable'));

      const result = await nutritionService.calculateNutritionForRecipe(mockRecipeId);

      expect(result).toBeNull();
    });

    it('should handle invalid AI response', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // No existing nutrition
        .mockResolvedValueOnce({ rows: [mockRecipe] }) // Recipe details
        .mockResolvedValueOnce({ rows: mockIngredients }); // Ingredients

      // Invalid JSON response
      mockAIClient.generateCompletion.mockResolvedValue('Invalid response format');

      const result = await nutritionService.calculateNutritionForRecipe(mockRecipeId);

      expect(result).toBeNull();
    });
  });

  describe('getNutritionForRecipe', () => {
    it('should retrieve nutrition data from database', async () => {
      const mockNutrition = {
        recipe_id: 'recipe-123',
        serving_size: 2,
        calories: 200,
        protein: 8,
        carbs: 30,
        fat: 6
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockNutrition] });

      const result = await nutritionService.getNutritionForRecipe('recipe-123');

      expect(result).toBeTruthy();
      expect(result?.recipeId).toBe('recipe-123');
      expect(result?.calories).toBe(200);
    });

    it('should return null if no nutrition data found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await nutritionService.getNutritionForRecipe('recipe-123');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      const result = await nutritionService.getNutritionForRecipe('recipe-123');

      expect(result).toBeNull();
    });
  });

  describe('scaleNutrition', () => {
    it('should scale nutrition values correctly', () => {
      const originalNutrition: NutritionData = {
        recipeId: 'recipe-123',
        servingSize: 2,
        calories: 200,
        protein: 8,
        carbs: 30,
        fat: 6,
        fiber: 4,
        sugar: 5
      };

      const scaled = nutritionService.scaleNutrition(originalNutrition, 4);

      expect(scaled.servingSize).toBe(4);
      expect(scaled.calories).toBe(400); // 200 * 2
      expect(scaled.protein).toBe(16); // 8 * 2
      expect(scaled.carbs).toBe(60); // 30 * 2
      expect(scaled.fat).toBe(12); // 6 * 2
    });

    it('should handle fractional scaling', () => {
      const originalNutrition: NutritionData = {
        recipeId: 'recipe-123',
        servingSize: 4,
        calories: 400,
        protein: 16,
        carbs: 60,
        fat: 12
      };

      const scaled = nutritionService.scaleNutrition(originalNutrition, 1);

      expect(scaled.servingSize).toBe(1);
      expect(scaled.calories).toBe(100); // 400 / 4
      expect(scaled.protein).toBe(4); // 16 / 4
      expect(scaled.carbs).toBe(15); // 60 / 4
      expect(scaled.fat).toBe(3); // 12 / 4
    });

    it('should preserve undefined values during scaling', () => {
      const originalNutrition: NutritionData = {
        recipeId: 'recipe-123',
        servingSize: 2,
        calories: 200,
        protein: undefined,
        carbs: 30
      };

      const scaled = nutritionService.scaleNutrition(originalNutrition, 4);

      expect(scaled.calories).toBe(400);
      expect(scaled.protein).toBeUndefined();
      expect(scaled.carbs).toBe(60);
    });
  });
});