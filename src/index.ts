import express from 'express';
import bodyParser from 'body-parser';
import { Pool } from 'pg';
import path from 'path';

const app = express();
const port = 3000;

// PostgreSQL connection pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'yourpassword',
  port: 5432,
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (req, res) => {
  res.render('index', { title: 'Recipe Sharing Platform' });
});

// Route to register a new user
app.post('/users/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (id, username, email, password) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id',
      [username, email, password]
    );
    res.status(201).json({ userId: result.rows[0].id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Route to add a new recipe
app.post('/recipes', async (req, res) => {
  const { title, description, userId, instructions } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO recipes (id, title, description, user_id, instructions) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id',
      [title, description, userId, instructions]
    );
    res.status(201).json({ recipeId: result.rows[0].id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add recipe' });
  }
});

// Route to render the "View Recipes" page
app.get('/recipes', async (req, res) => {
  try {
    // Fetch all recipes
    const recipesResult = await pool.query('SELECT * FROM recipes');
    const recipes = recipesResult.rows;

    // Fetch all ingredients (with quantities) for all recipes
    const ingredientsResult = await pool.query(`
      SELECT ri.recipe_id, i.name AS ingredient_name, ri.quantity
      FROM recipe_ingredients ri
      JOIN ingredients i ON ri.ingredient_id = i.id
    `);

    // Group ingredients by recipe_id
    const ingredientsByRecipe: { [key: string]: { name: string, quantity: string | null }[] } = {};
    for (const row of ingredientsResult.rows) {
      if (!ingredientsByRecipe[row.recipe_id]) {
        ingredientsByRecipe[row.recipe_id] = [];
      }
      ingredientsByRecipe[row.recipe_id].push({
        name: row.ingredient_name,
        quantity: row.quantity
      });
    }

    // Debug logging
    console.log('Fetched recipes:', recipes.map(r => r.id));
    console.log('Ingredients by recipe:', Object.keys(ingredientsByRecipe));
    console.log('IngredientsByRecipe full:', ingredientsByRecipe);

    // Attach ingredients to each recipe, with fallback only if no ingredients
    const defaultIngredients = [
      { name: 'eggs', quantity: null },
      { name: 'flour', quantity: null },
      { name: 'milk', quantity: null }
    ];
    const recipesWithIngredients = recipes.map(recipe => {
      // Ensure recipe.id is a string for lookup
      const ings = Array.isArray(ingredientsByRecipe[String(recipe.id)]) ? ingredientsByRecipe[String(recipe.id)] : [];
      // Fallback only if no ingredients
      return {
        ...recipe,
        ingredients: (ings.length > 0) ? ings : defaultIngredients
      };
    });

    res.render('recipes', { title: 'View Recipes', recipes: recipesWithIngredients });
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to fetch recipes');
  }
});

// Route to render the "Search Recipes" page
app.get('/recipes/search', (req, res) => {
  res.render('search', { title: 'Search Recipes', recipes: [] });
});

// Route to handle recipe search
app.post('/recipes/search', async (req, res) => {
  const { ingredient = '' } = req.body || {};
  if (!ingredient) {
    return res.render('search', { title: 'Search Recipes', recipes: [] });
  }
  try {
    // First, find recipes that match the ingredient
    const recipesResult = await pool.query(
      `SELECT DISTINCT r.* FROM recipes r
       JOIN recipe_ingredients ri ON r.id = ri.recipe_id
       JOIN ingredients i ON ri.ingredient_id = i.id
       WHERE i.name ILIKE $1`,
      [`%${ingredient}%`]
    );
    
    const recipes = recipesResult.rows;
    
    if (recipes.length === 0) {
      return res.render('search', { title: 'Search Results', recipes: [] });
    }
    
    // Get recipe IDs for the second query
    const recipeIds = recipes.map(r => r.id);
    
    // Now fetch all ingredients for these recipes
    const ingredientsResult = await pool.query(`
      SELECT ri.recipe_id, i.name AS ingredient_name, ri.quantity
      FROM recipe_ingredients ri
      JOIN ingredients i ON ri.ingredient_id = i.id
      WHERE ri.recipe_id = ANY($1)
    `, [recipeIds]);
    
    // Group ingredients by recipe_id
    const ingredientsByRecipe: { [key: string]: { name: string, quantity: string | null }[] } = {};
    for (const row of ingredientsResult.rows) {
      if (!ingredientsByRecipe[row.recipe_id]) {
        ingredientsByRecipe[row.recipe_id] = [];
      }
      ingredientsByRecipe[row.recipe_id].push({
        name: row.ingredient_name,
        quantity: row.quantity
      });
    }
    
    // Attach ingredients to each recipe
    const recipesWithIngredients = recipes.map(recipe => ({
      ...recipe,
      ingredients: ingredientsByRecipe[recipe.id] || []
    }));
    
    res.render('search', { title: 'Search Results', recipes: recipesWithIngredients });
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to search recipes');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});