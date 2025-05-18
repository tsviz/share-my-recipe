// src/routes/mealPlanRoutes.ts
import express from 'express';
import { isAuthenticated } from '../auth/auth-utils';
import {
  getMealPlans,
  getMealPlan,
  createMealPlan,
  updateMealPlan,
  deleteMealPlan,
  setPool
} from '../controllers/mealPlanController';

import { Pool } from 'pg';

export function mealPlanRoutes(pool: Pool) {
  const router = express.Router();
  setPool(pool);

  router.get('/', isAuthenticated, getMealPlans);
  router.get('/:id', isAuthenticated, (req, res, next) => {
    getMealPlan(req, res).catch(next);
  });
  router.post('/', isAuthenticated, createMealPlan);
  router.put('/:id', isAuthenticated, (req, res, next) => {
    updateMealPlan(req, res).catch(next);
  });
  router.delete('/:id', isAuthenticated, deleteMealPlan);

  return router;
}
