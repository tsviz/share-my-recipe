// src/routes/mealPlanItemRoutes.ts
import express from 'express';
import { isAuthenticated } from '../auth/auth-utils';
import {
  getMealPlanItems,
  addMealPlanItem,
  updateMealPlanItem,
  deleteMealPlanItem,
  setPool
} from '../controllers/mealPlanItemController';
import { Pool } from 'pg';

export function mealPlanItemRoutes(pool: Pool) {
  const router = express.Router({ mergeParams: true });
  setPool(pool);

  // Helper to wrap async route handlers and forward errors
  function asyncHandler(fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any> | any) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  router.get('/', isAuthenticated, asyncHandler(getMealPlanItems));
  router.post('/', isAuthenticated, asyncHandler(addMealPlanItem));
  router.put('/:itemId', isAuthenticated, asyncHandler(updateMealPlanItem));
  router.delete('/:itemId', isAuthenticated, asyncHandler(deleteMealPlanItem));

  return router;
}
