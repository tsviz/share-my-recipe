import { Pool } from 'pg';
import { IngredientSubstitutionService, IngredientSubstitution, SubstitutionRequest } from '../src/llm/ingredient-substitution-service';

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

describe('IngredientSubstitutionService', () => {
  let substitutionService: IngredientSubstitutionService;
  let mockAIClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    substitutionService = new IngredientSubstitutionService(mockPool);
    // Get the mocked AI client instance
    mockAIClient = (substitutionService as any).aiClient;
  });

  describe('getSubstitutions', () => {
    const mockRequest: SubstitutionRequest = {
      ingredient: 'butter',
      quantity: '1 cup',
      recipeContext: 'baking',
      dietaryRestrictions: ['dairy-free']
    };

    const mockDbSubstitutions = [
      {
        id: 'sub-1',
        original_ingredient: 'butter',
        substitute_ingredient: 'vegetable oil',
        conversion_ratio: '1 cup butter = 3/4 cup oil',
        substitution_context: 'baking',
        dietary_tags: '["dairy-free"]',
        confidence_score: 0.85,
        usage_count: 5,
        success_rate: 0.9
      },
      {
        id: 'sub-2',
        original_ingredient: 'butter',
        substitute_ingredient: 'applesauce',
        conversion_ratio: '1 cup butter = 1/2 cup applesauce',
        substitution_context: 'baking',
        dietary_tags: '["dairy-free", "lower-fat"]',
        confidence_score: 0.75,
        usage_count: 3,
        success_rate: 0.8
      }
    ];

    it('should return database substitutions when available and reliable', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: mockDbSubstitutions });

      const result = await substitutionService.getSubstitutions(mockRequest);

      expect(result.originalIngredient).toBe('butter');
      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0].substituteIngredient).toBe('vegetable oil');
      expect(result.suggestions[0].dietaryTags).toContain('dairy-free');
      expect(result.explanation).toContain('reliable');
      
      // Should not call AI when database has good suggestions
      expect(mockAIClient.generateCompletion).not.toHaveBeenCalled();
    });

    it('should enhance with AI when database suggestions are limited', async () => {
      // Mock limited database results
      const limitedDbSuggestions = [mockDbSubstitutions[0]]; // Only one suggestion
      limitedDbSuggestions[0].confidence_score = 0.6; // Lower confidence

      mockPool.query.mockResolvedValueOnce({ rows: limitedDbSuggestions });

      // Mock AI response
      const mockAIResponse = `{
        "substitutions": [
          {
            "substitute": "coconut oil",
            "ratio": "1:1",
            "context": "baking",
            "dietaryTags": ["dairy-free", "vegan"],
            "confidence": 0.8,
            "notes": "Works well in baking"
          },
          {
            "substitute": "mashed banana",
            "ratio": "1 cup butter = 1/2 cup mashed banana",
            "context": "baking",
            "dietaryTags": ["dairy-free", "vegan", "lower-fat"],
            "confidence": 0.7,
            "notes": "Adds natural sweetness"
          }
        ]
      }`;

      mockAIClient.generateCompletion.mockResolvedValue(mockAIResponse);

      const result = await substitutionService.getSubstitutions(mockRequest);

      expect(result.suggestions.length).toBeGreaterThan(1);
      expect(result.explanation).toContain('AI-enhanced');
      expect(mockAIClient.generateCompletion).toHaveBeenCalled();

      // Should include both database and AI suggestions
      const substituteNames = result.suggestions.map(s => s.substituteIngredient);
      expect(substituteNames).toContain('vegetable oil'); // From database
      expect(substituteNames).toContain('coconut oil'); // From AI
    });

    it('should handle dietary restrictions in query', async () => {
      const requestWithVegan: SubstitutionRequest = {
        ingredient: 'eggs',
        dietaryRestrictions: ['vegan', 'egg-free']
      };

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await substitutionService.getSubstitutions(requestWithVegan);

      // Verify that dietary restrictions were included in the database query
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('dietary_tags::jsonb ?');
      expect(queryCall[1]).toContain('vegan');
      expect(queryCall[1]).toContain('egg-free');
    });

    it('should handle recipe context in query', async () => {
      const requestWithContext: SubstitutionRequest = {
        ingredient: 'flour',
        recipeContext: 'baking'
      };

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await substitutionService.getSubstitutions(requestWithContext);

      // Verify that context was included in the database query
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('substitution_context');
      expect(queryCall[1]).toContain('baking');
    });

    it('should handle AI service errors gracefully', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockAIClient.generateCompletion.mockRejectedValue(new Error('AI service unavailable'));

      const result = await substitutionService.getSubstitutions(mockRequest);

      expect(result.originalIngredient).toBe('butter');
      expect(result.suggestions).toEqual([]);
      expect(result.explanation).toContain('learned patterns');
    });

    it('should handle invalid AI response format', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockAIClient.generateCompletion.mockResolvedValue('Invalid response format');

      const result = await substitutionService.getSubstitutions(mockRequest);

      expect(result.suggestions).toEqual([]);
    });

    it('should filter out empty substitute ingredients from AI response', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const mockAIResponseWithEmpty = `{
        "substitutions": [
          {
            "substitute": "",
            "ratio": "1:1",
            "context": "baking",
            "dietaryTags": ["dairy-free"],
            "confidence": 0.8
          },
          {
            "substitute": "coconut oil",
            "ratio": "1:1",
            "context": "baking",
            "dietaryTags": ["dairy-free"],
            "confidence": 0.8
          }
        ]
      }`;

      mockAIClient.generateCompletion.mockResolvedValue(mockAIResponseWithEmpty);

      const result = await substitutionService.getSubstitutions(mockRequest);

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].substituteIngredient).toBe('coconut oil');
    });
  });

  describe('saveFeedback', () => {
    it('should update existing substitution record', async () => {
      const existingRecord = {
        id: 'sub-1',
        usage_count: 5,
        success_rate: 0.8
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [existingRecord] }) // SELECT existing
        .mockResolvedValueOnce({}); // UPDATE

      await substitutionService.saveFeedback('butter', 'oil', true, 'baking');

      // Verify UPDATE query was called
      const updateCall = mockPool.query.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE ingredient_substitutions');
      expect(updateCall[1][0]).toBe(6); // usage_count + 1
      expect(updateCall[1][1]).toBeCloseTo(0.833, 2); // new success rate
    });

    it('should create new record for successful substitution', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // No existing record
        .mockResolvedValueOnce({}); // INSERT

      await substitutionService.saveFeedback('butter', 'coconut oil', true, 'baking');

      // Verify INSERT query was called
      const insertCall = mockPool.query.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO ingredient_substitutions');
      expect(insertCall[1]).toContain('butter');
      expect(insertCall[1]).toContain('coconut oil');
      expect(insertCall[1]).toContain('baking');
    });

    it('should not create record for unsuccessful substitution if none exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // No existing record

      await substitutionService.saveFeedback('butter', 'water', false, 'baking');

      // Should only call SELECT, not INSERT
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should handle database errors gracefully', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(
        substitutionService.saveFeedback('butter', 'oil', true, 'baking')
      ).resolves.toBeUndefined();
    });
  });

  describe('relevance scoring', () => {
    it('should boost score for matching context', async () => {
      const mockSubstitutions = [
        {
          id: 'sub-1',
          original_ingredient: 'butter',
          substitute_ingredient: 'oil',
          conversion_ratio: '1:1',
          substitution_context: 'baking',
          dietary_tags: '[]',
          confidence_score: 0.7,
          usage_count: 1,
          success_rate: 0.8
        },
        {
          id: 'sub-2',
          original_ingredient: 'butter',
          substitute_ingredient: 'margarine',
          conversion_ratio: '1:1',
          substitution_context: 'cooking',
          dietary_tags: '[]',
          confidence_score: 0.7,
          usage_count: 1,
          success_rate: 0.8
        }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockSubstitutions });

      const bakingRequest: SubstitutionRequest = {
        ingredient: 'butter',
        recipeContext: 'baking'
      };

      const result = await substitutionService.getSubstitutions(bakingRequest);

      // The baking context substitution should be ranked higher
      expect(result.suggestions[0].substitutionContext).toBe('baking');
    });

    it('should boost score for matching dietary restrictions', async () => {
      const mockSubstitutions = [
        {
          id: 'sub-1',
          original_ingredient: 'butter',
          substitute_ingredient: 'oil',
          conversion_ratio: '1:1',
          substitution_context: 'general',
          dietary_tags: '["dairy-free"]',
          confidence_score: 0.6,
          usage_count: 1,
          success_rate: 0.8
        },
        {
          id: 'sub-2',
          original_ingredient: 'butter',
          substitute_ingredient: 'margarine',
          conversion_ratio: '1:1',
          substitution_context: 'general',
          dietary_tags: '[]',
          confidence_score: 0.8,
          usage_count: 1,
          success_rate: 0.8
        }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockSubstitutions });

      const dairyFreeRequest: SubstitutionRequest = {
        ingredient: 'butter',
        dietaryRestrictions: ['dairy-free']
      };

      const result = await substitutionService.getSubstitutions(dairyFreeRequest);

      // The dairy-free substitution should be ranked higher despite lower base confidence
      expect(result.suggestions[0].dietaryTags).toContain('dairy-free');
    });
  });
});