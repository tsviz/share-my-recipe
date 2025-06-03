import express from 'express';
import { Pool } from 'pg';
import { isAuthenticated } from '../auth/auth-utils';

export function recipeCommentsRoutes(pool: Pool) {
  const router = express.Router();

  // Post a comment/rating
  router.post('/:recipeId/comments', isAuthenticated, async (req, res) => {
    const { recipeId } = req.params;
    const { comment, rating } = req.body;
    const userId = (req.user as any).id;

    await pool.query(
      `INSERT INTO recipe_comments (recipe_id, user_id, comment, rating) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, recipe_id) DO UPDATE SET comment = $3, rating = $4, created_at = NOW()`,
      [recipeId, userId, comment, rating]
    );
    res.redirect(`/recipes/${recipeId}`);
  });

  // Get comments/ratings for a recipe (for API or server-side rendering)
  router.get('/:recipeId/comments', async (req, res) => {
    const { recipeId } = req.params;
    const { rows } = await pool.query(
      `SELECT rc.*, u.username FROM recipe_comments rc
       JOIN users u ON rc.user_id = u.id
       WHERE rc.recipe_id = $1
       ORDER BY rc.created_at DESC`,
      [recipeId]
    );
    res.json(rows);
  });

  return router;
}
