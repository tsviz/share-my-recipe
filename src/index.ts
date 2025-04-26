import express from 'express';
import bodyParser from 'body-parser';
import { Pool } from 'pg';
import path from 'path';
import passport from 'passport';
import session from 'express-session';
import flash from 'connect-flash';
import bcrypt from 'bcrypt';

// Import authentication modules
import configurePassport from './auth/passport-config';
import { registerUser, updateUserProfile, changeUserPassword, isAuthenticated, isNotAuthenticated } from './auth/auth-utils';

const app = express();
const port = 3000;

// PostgreSQL connection pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'mydb',
  password: 'mypassword',
  port: 5432,
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set up session
app.use(session({
  secret: 'recipe_sharing_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Initialize Passport and restore authentication state from session
app.use(passport.initialize());
app.use(passport.session());

// Set up flash messages
app.use(flash());

// Configure Passport
configurePassport(passport, pool);

// Make flash messages and user available to all templates
app.use((req, res, next) => {
  if (!req.user) {
    console.log('Debug: req.user is undefined, waiting for deserialization');
    res.locals.isAuthenticated = false;
    res.locals.messages = req.flash() || {};
    return next();
  }
  console.log('Debug: Setting res.locals.user after deserialization =', req.user);
  res.locals.user = req.user;
  res.locals.isAuthenticated = req.isAuthenticated();
  res.locals.messages = req.flash() || {};
  next();
});

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../src/views'));

// Routes
app.get('/', (req, res) => {
  res.render('index', { title: 'Recipe Sharing Platform' });
});

// Authentication Routes
app.get('/login', isNotAuthenticated, (req, res) => {
  res.render('login');
});

app.post('/login', isNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/dashboard',
  failureRedirect: '/login',
  failureFlash: true
}));

app.get('/register', isNotAuthenticated, (req, res) => {
  res.render('register');
});

app.post('/register', isNotAuthenticated, async (req, res) => {
  try {
    const { username, email, password, confirm_password, bio } = req.body;

    // Validate input
    if (password !== confirm_password) {
      req.flash('error', 'Passwords do not match');
      return res.redirect('/register');
    }

    if (password.length < 8) {
      req.flash('error', 'Password must be at least 8 characters');
      return res.redirect('/register');
    }

    // Check if username or email already exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      req.flash('error', 'Username or email already exists');
      return res.redirect('/register');
    }

    // Register the user
    const userId = await registerUser(pool, username, email, password, bio);

    if (!userId) {
      req.flash('error', 'Failed to register user');
      return res.redirect('/register');
    }

    req.flash('success', 'Registration successful! Please log in.');
    res.redirect('/login');
  } catch (error) {
    console.error('Registration error:', error);
    req.flash('error', 'An error occurred during registration');
    res.redirect('/register');
  }
});

app.get('/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    req.flash('success', 'You have been logged out');
    res.redirect('/');
  });
});

// User Profile Routes
app.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    
    // Get user's recipes
    const recipesResult = await pool.query(
      'SELECT * FROM recipes WHERE user_id = $1 ORDER BY id DESC',
      [user.id]
    );
    
    // Get count of user's favorite recipes
    const favoritesResult = await pool.query(
      'SELECT COUNT(*) FROM favorites WHERE user_id = $1',
      [user.id]
    );
    
    res.render('profile', {
      user: user,
      recipes: recipesResult.rows,
      favoriteCount: parseInt(favoritesResult.rows[0].count),
      viewCount: 0, // We'll implement view counting later
      isOwnProfile: true
    });
  } catch (error) {
    console.error(error);
    req.flash('error', 'Failed to load dashboard');
    res.redirect('/');
  }
});

app.get('/profile', isAuthenticated, (req, res) => {
  res.redirect(`/profile/${(req.user as any).id}`);
});

app.get('/profile/edit', isAuthenticated, (req, res) => {
  console.log('Debug: req.user =', req.user);
  console.log('Debug: req.user in /profile/edit =', req.user);
  if (!req.user) {
    console.log('Debug: req.user is still undefined in /profile/edit');
    req.flash('error', 'User not found');
    return res.redirect('/login');
  }
  res.render('edit-profile', { user: req.user });
});

app.post('/profile/edit', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const { username, bio, currentPassword, newPassword, confirmPassword } = req.body;
    
    // Update profile info
    const profileUpdated = await updateUserProfile(pool, user.id, username, bio);
    
    if (!profileUpdated) {
      req.flash('error', 'Failed to update profile');
      return res.redirect('/profile/edit');
    }
    
    // Change password if provided
    if (currentPassword && newPassword) {
      if (newPassword !== confirmPassword) {
        req.flash('error', 'New passwords do not match');
        return res.redirect('/profile/edit');
      }
      
      const passwordResult = await changeUserPassword(pool, user.id, currentPassword, newPassword);
      
      if (!passwordResult.success) {
        req.flash('error', passwordResult.message);
        return res.redirect('/profile/edit');
      }
      
      req.flash('success', 'Profile and password updated successfully');
    } else {
      req.flash('success', 'Profile updated successfully');
    }
    
    res.redirect('/profile');
  } catch (error) {
    console.error(error);
    req.flash('error', 'An error occurred while updating your profile');
    res.redirect('/profile/edit');
  }
});

app.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user data
    const userResult = await pool.query(
      'SELECT id, username, email, created_at, profile_image, bio FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      req.flash('error', 'User not found');
      return res.redirect('/');
    }
    
    const user = userResult.rows[0];
    
    // Get user's recipes
    const recipesResult = await pool.query(
      `SELECT r.*, c.name as category_name 
       FROM recipes r 
       LEFT JOIN categories c ON r.category_id = c.id 
       WHERE r.user_id = $1 
       ORDER BY r.id DESC`,
      [userId]
    );
    
    // Get count of user's favorite recipes
    const favoritesResult = await pool.query(
      'SELECT COUNT(*) FROM favorites WHERE user_id = $1',
      [userId]
    );
    
    const isOwnProfile = req.isAuthenticated() && (req.user as any).id === userId;
    
    res.render('profile', {
      user: user,
      recipes: recipesResult.rows,
      favoriteCount: parseInt(favoritesResult.rows[0].count),
      viewCount: 0, // We'll implement view counting later
      isOwnProfile: isOwnProfile
    });
  } catch (error) {
    console.error(error);
    req.flash('error', 'Failed to load profile');
    res.redirect('/');
  }
});

// Route to register a new user (deprecated, use auth flow instead)
app.post('/users/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    // Hash password before storing
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const result = await pool.query(
      'INSERT INTO users (id, username, email, password) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id',
      [username, email, hashedPassword]
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