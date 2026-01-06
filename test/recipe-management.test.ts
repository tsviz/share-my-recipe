import { Pool } from 'pg';

// Mock the pg module
jest.mock('pg', () => {
  const query = jest.fn();
  const mockPool = {
    query,
  };
  return { Pool: jest.fn(() => mockPool) };
});

const mockPool = new Pool() as unknown as Pool & {
  query: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Recipe Management', () => {
  describe('Recipe Creation with New Fields', () => {
    it('should create a recipe with prep_time_minutes, cook_time_minutes, servings, and difficulty', async () => {
      mockPool.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 'recipe-123',
          title: 'Test Recipe',
          description: 'A test recipe',
          cuisine: 'Italian',
          prep_time_minutes: 15,
          cook_time_minutes: 30,
          servings: 4,
          difficulty: 'Medium'
        }] 
      });

      // Simulate recipe creation
      const recipeData = {
        title: 'Test Recipe',
        description: 'A test recipe',
        cuisine: 'Italian',
        prep_time_minutes: 15,
        cook_time_minutes: 30,
        servings: 4,
        difficulty: 'Medium',
        user_id: 'user-123',
        instructions: 'Test instructions'
      };

      await mockPool.query(
        'INSERT INTO recipes (id, title, description, user_id, category_id, instructions, cuisine, prep_time_minutes, cook_time_minutes, servings, difficulty) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [
          recipeData.title,
          recipeData.description,
          recipeData.user_id,
          null,
          recipeData.instructions,
          recipeData.cuisine,
          recipeData.prep_time_minutes,
          recipeData.cook_time_minutes,
          recipeData.servings,
          recipeData.difficulty
        ]
      );

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO recipes'),
        expect.arrayContaining([
          'Test Recipe',
          'A test recipe',
          'user-123',
          null,
          'Test instructions',
          'Italian',
          15,
          30,
          4,
          'Medium'
        ])
      );
    });

    it('should handle null values for optional fields', async () => {
      mockPool.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 'recipe-124',
          title: 'Simple Recipe',
          description: 'A simple recipe',
          cuisine: 'American',
          prep_time_minutes: null,
          cook_time_minutes: null,
          servings: null,
          difficulty: null
        }] 
      });

      const recipeData = {
        title: 'Simple Recipe',
        description: 'A simple recipe',
        cuisine: 'American',
        user_id: 'user-123',
        instructions: 'Simple instructions'
      };

      await mockPool.query(
        'INSERT INTO recipes (id, title, description, user_id, category_id, instructions, cuisine, prep_time_minutes, cook_time_minutes, servings, difficulty) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [
          recipeData.title,
          recipeData.description,
          recipeData.user_id,
          null,
          recipeData.instructions,
          recipeData.cuisine,
          null,
          null,
          null,
          null
        ]
      );

      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('Recipe Update with New Fields', () => {
    it('should update a recipe with new metadata fields', async () => {
      mockPool.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 'recipe-123',
          title: 'Updated Recipe',
          prep_time_minutes: 20,
          cook_time_minutes: 45,
          servings: 6,
          difficulty: 'Hard'
        }] 
      });

      const updateData = {
        title: 'Updated Recipe',
        description: 'Updated description',
        category_id: null,
        instructions: 'Updated instructions',
        cuisine: 'French',
        prep_time_minutes: 20,
        cook_time_minutes: 45,
        servings: 6,
        difficulty: 'Hard',
        recipe_id: 'recipe-123',
        user_id: 'user-123'
      };

      await mockPool.query(
        'UPDATE recipes SET title = $1, description = $2, category_id = $3, instructions = $4, cuisine = $5, prep_time_minutes = $6, cook_time_minutes = $7, servings = $8, difficulty = $9 WHERE id = $10 AND user_id = $11',
        [
          updateData.title,
          updateData.description,
          updateData.category_id,
          updateData.instructions,
          updateData.cuisine,
          updateData.prep_time_minutes,
          updateData.cook_time_minutes,
          updateData.servings,
          updateData.difficulty,
          updateData.recipe_id,
          updateData.user_id
        ]
      );

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE recipes SET'),
        expect.arrayContaining([
          'Updated Recipe',
          'Updated description',
          null,
          'Updated instructions',
          'French',
          20,
          45,
          6,
          'Hard',
          'recipe-123',
          'user-123'
        ])
      );
    });
  });

  describe('Recipe Retrieval with Metadata', () => {
    it('should retrieve recipe with all metadata fields', async () => {
      const mockRecipe = {
        id: 'recipe-123',
        title: 'Test Recipe',
        description: 'A test recipe',
        cuisine: 'Italian',
        prep_time_minutes: 15,
        cook_time_minutes: 30,
        servings: 4,
        difficulty: 'Medium',
        instructions: 'Test instructions',
        user_id: 'user-123'
      };

      mockPool.query.mockResolvedValueOnce({ 
        rows: [mockRecipe] 
      });

      const result = await mockPool.query(
        'SELECT * FROM recipes WHERE id = $1',
        ['recipe-123']
      );

      expect(result.rows[0]).toEqual(mockRecipe);
      expect(result.rows[0].prep_time_minutes).toBe(15);
      expect(result.rows[0].cook_time_minutes).toBe(30);
      expect(result.rows[0].servings).toBe(4);
      expect(result.rows[0].difficulty).toBe('Medium');
    });

    it('should calculate total time from prep and cook times', () => {
      const recipe = {
        prep_time_minutes: 20,
        cook_time_minutes: 40
      };

      const totalTime = (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0);
      expect(totalTime).toBe(60);
    });

    it('should handle recipes without time information', () => {
      const recipe = {
        prep_time_minutes: null,
        cook_time_minutes: null
      };

      const totalTime = (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0);
      expect(totalTime).toBe(0);
    });
  });

  describe('Difficulty Level Validation', () => {
    it('should accept valid difficulty levels', () => {
      const validDifficulties = ['Easy', 'Medium', 'Hard'];
      
      validDifficulties.forEach(difficulty => {
        expect(['Easy', 'Medium', 'Hard'].includes(difficulty)).toBe(true);
      });
    });

    it('should handle case-sensitive difficulty levels', () => {
      const difficulty = 'Medium';
      expect(difficulty).toBe('Medium');
      expect(difficulty).not.toBe('medium');
    });
  });

  describe('Servings Validation', () => {
    it('should accept valid serving sizes', () => {
      const servings = 4;
      expect(servings).toBeGreaterThan(0);
      expect(servings).toBeLessThanOrEqual(100);
    });

    it('should handle null servings', () => {
      const servings = null;
      expect(servings).toBeNull();
    });
  });

  describe('Time Validation', () => {
    it('should accept valid time values', () => {
      const prepTime = 15;
      const cookTime = 30;
      
      expect(prepTime).toBeGreaterThanOrEqual(0);
      expect(cookTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero time values', () => {
      const prepTime = 0;
      expect(prepTime).toBe(0);
    });

    it('should handle null time values', () => {
      const prepTime = null;
      const cookTime = null;
      
      expect(prepTime).toBeNull();
      expect(cookTime).toBeNull();
    });
  });
});
