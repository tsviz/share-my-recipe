// src/routes/shoppingListRoutes.ts
import express from 'express';
import { isAuthenticated } from '../auth/auth-utils';
import { generateShoppingList, setPool } from '../controllers/shoppingListController';
import { Pool } from 'pg';

export function shoppingListRoutes(pool: Pool) {
  const router = express.Router({ mergeParams: true });
  setPool(pool);
  router.get('/generate', isAuthenticated, async (req, res, next) => {
    try {
      await generateShoppingList(req, res);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
