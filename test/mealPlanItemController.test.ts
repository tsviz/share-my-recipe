import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response } from 'express';
import { updateMealPlanItem, setPool } from '../src/controllers/mealPlanItemController';

// Mock the pool
const mockPool = {
  query: jest.fn() as jest.MockedFunction<any>
};

// Mock request and response objects
const mockRequest = (params: any, body: any, user: any) => ({
  params,
  body,
  user
} as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  res.end = jest.fn().mockReturnValue(res) as any;
  return res;
};

describe('MealPlanItemController - Edit Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPool(mockPool as any);
  });

  describe('updateMealPlanItem', () => {
    it('should successfully update a meal plan item', async () => {
      const req = mockRequest(
        { mealPlanId: 'plan123', itemId: 'item123' },
        { 
          recipe_id: 'recipe456', 
          meal_date: '2025-07-27', 
          meal_time: 'lunch', 
          servings: 2 
        },
        { id: 'user123' }
      );
      const res = mockResponse();

      // Mock successful plan validation
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'plan123',
            start_date: '2025-07-26',
            end_date: '2025-07-30'
          }]
        } as any)
        // Mock successful update
        .mockResolvedValueOnce({
          rows: [{
            id: 'item123',
            meal_plan_id: 'plan123',
            recipe_id: 'recipe456',
            meal_date: '2025-07-27',
            meal_time: 'lunch',
            servings: 2
          }]
        } as any);

      await updateMealPlanItem(req, res);

      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith({
        id: 'item123',
        meal_plan_id: 'plan123',
        recipe_id: 'recipe456',
        meal_date: '2025-07-27',
        meal_time: 'lunch',
        servings: 2
      });
    });

    it('should return 404 when meal plan is not found', async () => {
      const req = mockRequest(
        { mealPlanId: 'nonexistent', itemId: 'item123' },
        { recipe_id: 'recipe456', meal_date: '2025-07-27', meal_time: 'lunch', servings: 2 },
        { id: 'user123' }
      );
      const res = mockResponse();

      // Mock meal plan not found
      mockPool.query.mockResolvedValueOnce({ rows: [] } as any);

      await updateMealPlanItem(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Meal plan not found' });
    });

    it('should return 400 when meal date is outside plan range', async () => {
      const req = mockRequest(
        { mealPlanId: 'plan123', itemId: 'item123' },
        { 
          recipe_id: 'recipe456', 
          meal_date: '2025-08-01', // Outside range
          meal_time: 'lunch', 
          servings: 2 
        },
        { id: 'user123' }
      );
      const res = mockResponse();

      // Mock meal plan with date range
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'plan123',
          start_date: '2025-07-26',
          end_date: '2025-07-30'
        }]
      } as any);

      await updateMealPlanItem(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid meal date',
        details: 'The meal date must be between 2025-07-26 and 2025-07-30'
      });
    });

    it('should return 404 when meal plan item is not found for update', async () => {
      const req = mockRequest(
        { mealPlanId: 'plan123', itemId: 'nonexistent' },
        { recipe_id: 'recipe456', meal_date: '2025-07-27', meal_time: 'lunch', servings: 2 },
        { id: 'user123' }
      );
      const res = mockResponse();

      // Mock successful plan validation
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'plan123',
            start_date: '2025-07-26',
            end_date: '2025-07-30'
          }]
        } as any)
        // Mock item not found for update
        .mockResolvedValueOnce({ rows: [] } as any);

      await updateMealPlanItem(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Meal plan item not found' });
    });
  });
});
