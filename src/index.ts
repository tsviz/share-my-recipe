// Import dotenv at the very top to load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { Pool } from 'pg';
import path from 'path';
import passport from 'passport';
import session from 'express-session';
import { Session, SessionData } from 'express-session';
import flash from 'connect-flash';
import bcrypt from 'bcrypt';
import multer from 'multer';
import fetch from 'node-fetch';

// Import our LLM search service
import { RecipeSearchService } from './llm/recipe-search-service';

// Import authentication modules
import configurePassport from './auth/passport-config';
import { registerUser, updateUserProfile, changeUserPassword, isAuthenticated, isNotAuthenticated } from './auth/auth-utils';
import { mealPlanRoutes } from './routes/mealPlanRoutes';
import { mealPlanItemRoutes } from './routes/mealPlanItemRoutes';
import { shoppingListRoutes } from './routes/shoppingListRoutes';
import { recipeCommentsRoutes } from './routes/recipeCommentsRoutes';

const app = express();
const port = 3000;

// Add debugging to see if environment variables are loaded
console.log('Database connection settings:', {
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres'
});

// PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost', // Changed default from 'postgres' to 'localhost'
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || 'mypassword', // Updated default password
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
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 day
    sameSite: false, // allow all for debug
    secure: false    // do not require HTTPS for localhost
  }
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
  // Wait for passport to finish deserialization before setting res.locals
  if (typeof req.isAuthenticated !== 'function') {
    return next();
  }
  if (req.isAuthenticated()) {
    res.locals.user = req.user;
    res.locals.isAuthenticated = true;
  } else {
    res.locals.user = null;
    res.locals.isAuthenticated = false;
  }
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
  // Always pass returnTo from session or query
  const returnTo = req.session.returnTo || req.query.returnTo || '';
  console.log('GET /login: req.sessionID =', req.sessionID, 'req.session =', req.session);
  res.render('login', {
    returnTo,
    messages: { error: req.flash('error'), redirect: req.flash('redirect') }
  });
});
app.post('/login', isNotAuthenticated, (req, res, next) => {
  interface AuthInfo {
    message?: string;
  }
  if (req.body.returnTo && req.body.returnTo.trim() !== '') {
    req.session.returnTo = req.body.returnTo;
  }
  console.log('POST /login: req.sessionID =', req.sessionID, 'req.session =', req.session);
  passport.authenticate('local', (err: Error | null, user: any, info: AuthInfo) => {
    if (err) { return next(err); }
    if (!user) {
      req.flash('error', info.message || 'Invalid credentials');
      return res.render('login', {
        returnTo: req.body.returnTo || req.session.returnTo || '',
        messages: { error: info.message || 'Invalid credentials', redirect: req.flash('redirect') }
      });
    }
    // Preserve returnTo across session regeneration
    const returnTo = req.session.returnTo;
    req.logIn(user, (err: Error) => {
      if (err) { return next(err); }
      req.session.returnTo = returnTo; // Restore after session regeneration
      console.log('LOGIN REDIRECT: req.sessionID =', req.sessionID, 'req.session.returnTo =', req.session.returnTo);
      const redirectTo: string = req.session.returnTo || '/profile';
      delete req.session.returnTo;
      return res.redirect(redirectTo);
    });
  })(req, res, next);
});

app.get('/register', isNotAuthenticated, (req, res) => {
  res.render('register', { title: 'Register - Share My Recipe' });
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
    
    res.render('dashboard', {
      title: 'Dashboard - Share My Recipe',
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
  console.log('REDIRECTING TO /profile/:id', (req.user as any).id);
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
  res.render('edit-profile', { 
    title: 'Edit Profile - Share My Recipe',
    user: req.user 
  });
});

// Set up multer for profile image uploads
const upload = multer(); // Use memory storage for buffer
const uploadDir = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadDir));

app.post('/profile/edit', isAuthenticated, upload.single('profile_image'), async (req, res) => {
  try {
    const user = req.user as any;
    const { username, bio, currentPassword, newPassword, confirmPassword } = req.body;
    if (req.file) {
      await pool.query('UPDATE users SET profile_image = $1 WHERE id = $2', [req.file.buffer, user.id]);
    }
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
    const recipesResult = await pool.query(`
      SELECT r.*, c.name as category_name,
        COALESCE(AVG(rc.rating), 0) as average_rating,
        COUNT(rc.rating) as rating_count
      FROM recipes r
      LEFT JOIN categories c ON r.category_id = c.id
      LEFT JOIN recipe_comments rc ON r.id = rc.recipe_id
      WHERE r.user_id = $1
      GROUP BY r.id, c.name
      ORDER BY r.id DESC
    `, [userId]);
    
    // Get count of user's favorite recipes
    const favoritesResult = await pool.query(
      'SELECT COUNT(*) FROM favorites WHERE user_id = $1',
      [userId]
    );
    
    const isOwnProfile = req.isAuthenticated() && (req.user as any).id === userId;
    
    res.render('profile', {
      title: `${user.username}'s Profile - Share My Recipe`,
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

// New route to display a user's profile, their recipes, and their favorite recipes
app.get('/users/:id', isAuthenticated, async (req, res) => {
  const userId = req.params.id;
  try {
    // Fetch user info
    const userResult = await pool.query('SELECT id, username, bio, profile_image, created_at FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      req.flash('error', 'User not found');
      return res.redirect('/');
    }
    const profileUser = userResult.rows[0]; // Renamed from 'user' to 'profileUser'

    // Fetch user's own recipes
    const recipesResult = await pool.query(`
      SELECT r.*, c.name as category_name,
        COALESCE(AVG(rc.rating), 0) as average_rating,
        COUNT(rc.rating) as rating_count
      FROM recipes r
      LEFT JOIN categories c ON r.category_id = c.id
      LEFT JOIN recipe_comments rc ON r.id = rc.recipe_id
      WHERE r.user_id = $1
      GROUP BY r.id, c.name
      ORDER BY r.id DESC
    `, [userId]);
    const recipes = recipesResult.rows;

    // Fetch user's favorite recipes
    const favResult = await pool.query(`
      SELECT r.*, c.name as category_name, u.username,
        f.created_at,
        COALESCE(AVG(rc.rating), 0) as average_rating,
        COUNT(rc.rating) as rating_count
      FROM favorites f
      JOIN recipes r ON f.recipe_id = r.id
      LEFT JOIN categories c ON r.category_id = c.id
      JOIN users u ON r.user_id = u.id
      LEFT JOIN recipe_comments rc ON r.id = rc.recipe_id
      WHERE f.user_id = $1
      GROUP BY r.id, c.name, u.username, f.created_at
      ORDER BY f.created_at DESC
    `, [userId]);
    const favoriteRecipes = favResult.rows;

    res.render('user-profile', {
      title: `${profileUser.username}'s Profile`,
      profileUser, // Changed from 'user' to 'profileUser'
      recipes,
      favoriteRecipes
    });
  } catch (error) {
    console.error(error);
    req.flash('error', 'Failed to load user profile');
    res.redirect('/');
  }
});

// Route to serve user profile image as binary
app.get('/users/:id/profile-image', async (req, res) => {
  try {
    const userId = req.params.id;
    const result = await pool.query('SELECT profile_image FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0 || !result.rows[0].profile_image) {
      // Send a default image if not found
      return res.sendFile(path.join(__dirname, '../uploads/default-profile.png'));
    }
    const imgBuffer = result.rows[0].profile_image;
    // Try to detect image type (default to png)
    let contentType = 'image/png';
    if (imgBuffer && imgBuffer.length > 3) {
      if (imgBuffer[0] === 0xff && imgBuffer[1] === 0xd8) contentType = 'image/jpeg';
      else if (imgBuffer[0] === 0x89 && imgBuffer[1] === 0x50) contentType = 'image/png';
      else if (imgBuffer[0] === 0x47 && imgBuffer[1] === 0x49) contentType = 'image/gif';
    }
    res.set('Content-Type', contentType);
    res.send(imgBuffer);
  } catch (error) {
    res.status(404).end();
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

// Add a route to display all users
app.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, created_at, bio FROM users ORDER BY username'
    );
    
    res.render('users', {
      title: 'All Users',
      users: result.rows
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    req.flash('error', 'Failed to load users');
    res.redirect('/');
  }
});

// Activity route - shows user's recent activity
app.get('/activity', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    console.log('Activity route accessed by user:', user.id);
    
    // Initialize arrays for activities
    let activities = [];
    
    try {
      // Get user's recent recipe creations
      const recentRecipesResult = await pool.query(
        `SELECT r.id, r.title, r.created_at, 'created' as activity_type
         FROM recipes r 
         WHERE r.user_id = $1 
         ORDER BY r.created_at DESC 
         LIMIT 10`,
        [user.id]
      );
      console.log('Recent recipes found:', recentRecipesResult.rows.length, recentRecipesResult.rows);

      // Add recipe creations to activities
      recentRecipesResult.rows.forEach(row => {
        activities.push({
          ...row,
          action: 'Created',
          icon: 'bi-plus-circle',
          color: 'success'
        });
      });

    } catch (recipeError) {
      console.error('Error fetching recipes:', recipeError);
    }

    try {
      // Get user's recent favorites
      const recentFavoritesResult = await pool.query(
        `SELECT r.id, r.title, f.created_at, 'favorited' as activity_type
         FROM favorites f 
         JOIN recipes r ON f.recipe_id = r.id 
         WHERE f.user_id = $1 
         ORDER BY f.created_at DESC 
         LIMIT 10`,
        [user.id]
      );
      console.log('Recent favorites found:', recentFavoritesResult.rows.length, recentFavoritesResult.rows);

      // Add favorites to activities
      recentFavoritesResult.rows.forEach(row => {
        activities.push({
          ...row,
          action: 'Favorited',
          icon: 'bi-heart-fill',
          color: 'danger'
        });
      });

    } catch (favoritesError) {
      console.error('Error fetching favorites:', favoritesError);
    }

    // Always add some sample activities to demonstrate the timeline
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Add sample activities with different timestamps
    const sampleActivities = [
      {
        id: 'sample-1',
        title: 'the recipe collection',
        created_at: oneHourAgo,
        activity_type: 'browsed',
        action: 'Browsed',
        icon: 'bi-search',
        color: 'info'
      },
      {
        id: 'sample-2',
        title: 'Share My Recipe platform',
        created_at: twoDaysAgo,
        activity_type: 'joined',
        action: 'Joined',
        icon: 'bi-person-check',
        color: 'primary'
      },
      {
        id: 'sample-3',
        title: 'cooking tips and tricks',
        created_at: oneWeekAgo,
        activity_type: 'explored',
        action: 'Explored',
        icon: 'bi-lightbulb',
        color: 'warning'
      }
    ];

    // Add sample activities
    activities.push(...sampleActivities);

    // Sort activities by date
    activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    console.log('Total activities before rendering:', activities.length);
    activities.forEach((activity, index) => {
      console.log(`Activity ${index + 1}:`, {
        action: activity.action,
        title: activity.title,
        type: activity.activity_type,
        date: activity.created_at
      });
    });

    // Get user's stats with fallbacks
    let totalRecipes = 0;
    let totalFavorites = 0;
    let recentRecipes = [];

    try {
      const recipeCountResult = await pool.query('SELECT COUNT(*) FROM recipes WHERE user_id = $1', [user.id]);
      totalRecipes = parseInt(recipeCountResult.rows[0].count) || 0;
    } catch (error) {
      console.error('Error fetching recipe count:', error);
    }

    try {
      const favCountResult = await pool.query('SELECT COUNT(*) FROM favorites WHERE user_id = $1', [user.id]);
      totalFavorites = parseInt(favCountResult.rows[0].count) || 0;
    } catch (error) {
      console.error('Error fetching favorites count:', error);
    }

    try {
      const recentRecipesResult = await pool.query(
        'SELECT id, title, created_at FROM recipes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
        [user.id]
      );
      recentRecipes = recentRecipesResult.rows;
    } catch (error) {
      console.error('Error fetching recent recipes:', error);
    }

    console.log('Rendering activity page with:', {
      activitiesCount: activities.length,
      totalRecipes,
      totalFavorites,
      recentRecipesCount: recentRecipes.length
    });

    res.render('activity', {
      title: 'Activity - Share My Recipe',
      activities: activities.slice(0, 20), // Show last 20 activities
      totalRecipes,
      totalFavorites,
      recentRecipes
    });

  } catch (error) {
    console.error('Error loading activity:', error);
    req.flash('error', 'Failed to load activity');
    res.redirect('/dashboard');
  }
});

// Route to add a recipe
app.post('/recipes', isAuthenticated, async (req, res) => {
  const { title, description, category_id, instructions, cuisine } = req.body;
  const userId = (req.user as any).id;
  try {
    await pool.query(
      'INSERT INTO recipes (id, title, description, user_id, category_id, instructions, cuisine) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)',
      [title, description, userId, category_id || null, instructions, cuisine || null]
    );
    req.flash('success', 'Recipe created successfully!');
    return res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    req.flash('error', 'Failed to add recipe: ' + errorMessage);
    return res.redirect('/recipes/new');
  }
});

// Route to add a recipe to favorites
app.post('/recipes/:id/favorite', isAuthenticated, async (req, res) => {
  const userId = (req.user as any).id;
  const recipeId = req.params.id;
  const { q, category, cuisine, page } = req.body;
  try {
    await pool.query(
      'INSERT INTO favorites (user_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, recipeId]
    );
    // Redirect back to the referring page
    const referer = req.get('Referer');
    if (referer) {
      return res.redirect(referer);
    }
    let redirectUrl = '/recipes';
    const params = [];
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    if (category) params.push(`category=${encodeURIComponent(category)}`);
    if (cuisine) params.push(`cuisine=${encodeURIComponent(cuisine)}`);
    if (page) params.push(`page=${encodeURIComponent(page)}`);
    if (params.length > 0) redirectUrl += '?' + params.join('&');
    res.redirect(redirectUrl);
  } catch (error) {
    console.error(error);
    req.flash('error', 'Failed to favorite recipe');
    res.redirect('/recipes');
  }
});

// Route to unfavorite a recipe 
app.post('/recipes/:id/unfavorite', isAuthenticated, async (req, res) => {
  const userId = (req.user as any).id;
  const recipeId = req.params.id;
  const { q, category, cuisine, page } = req.body;
  const requestPath = req.path;
  
  try {
    // Delete the favorite record
    const result = await pool.query(
      'DELETE FROM favorites WHERE user_id = $1 AND recipe_id = $2 RETURNING id',
      [userId, recipeId]
    );
    
    console.log(`Unfavorited recipe ${recipeId} for user ${userId}, removed ${result.rowCount} records`);

    // Check if this request is coming from the favorites page
    const referer = req.get('Referer') || '';
    const isFromFavoritesPage = referer.includes('/favorites');
    
    if (isFromFavoritesPage) {
      // If unfavorited from the favorites page, redirect back to favorites
      return res.redirect('/favorites');
    }
    
    // Otherwise, redirect to the same page with the search parameters preserved
    let redirectUrl = '/recipes';
    const params = [];
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    if (category) params.push(`category=${encodeURIComponent(category)}`);
    if (cuisine) params.push(`cuisine=${encodeURIComponent(cuisine)}`);
    if (page) params.push(`page=${encodeURIComponent(page)}`);
    if (params.length > 0) redirectUrl += '?' + params.join('&');
    
    // If there's a referer, use it to maintain the current page
    if (referer && !isFromFavoritesPage) {
      return res.redirect(referer);
    }
    
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Error unfavoriting recipe:", error);
    req.flash('error', 'Failed to unfavorite recipe');
    res.redirect('/recipes');
  }
});

// IMPORTANT: More specific routes come before general routes
// Route to render the "Search Recipes" page
app.get('/recipes/search', async (req, res) => {
  const searchQuery = req.query.q as string;
  
  // If we have a search query, automatically perform the search
  if (searchQuery && typeof searchQuery === 'string') {
    try {
      console.log("=== RESTORING SEARCH RESULTS ===");
      console.log("Search query:", searchQuery);

      const { recipes, positiveVibe, aiExplanation } = await recipeSearchService.searchRecipesWithPositiveVibe(searchQuery);
      const recommendations = recipes.slice(0, 12);

      console.log(`Restored search returned ${recommendations.length} matching recipes`);

      return res.render('search', {
        about: searchQuery,
        recommendations,
        aiExplanation,
        positiveVibe,
        title: 'Personalized Recipe Recommendations',
        ai_enabled: true
      });
    } catch (e) {
      console.error("Error restoring search results:", e);
      return res.render('search', {
        about: searchQuery,
        recommendations: [],
        title: 'Personalized Recipe Recommendations',
        ai_enabled: true
      });
    }
  }

  // Otherwise show empty search page
  res.render('search', { 
    title: 'Personalized Recipe Recommendations',
    ai_enabled: true
  });
});

// Create an instance of our AI-powered search service
const recipeSearchService = new RecipeSearchService(pool);

// Update the search endpoint to use AI-powered search
app.post('/recipes/search', async (req, res) => {
  const about = req.body.about || '';

  try {
    console.log("=== USER PREFERENCE DETECTION ===");
    console.log("User input:", about);

    // Use the AI-powered search service with combined functionality
    const { recipes, positiveVibe, aiExplanation } = await recipeSearchService.searchRecipesWithPositiveVibe(about);

    console.log(`AI search returned ${recipes.length} matching recipes`);

    // Limit to 12 recommendations
    const recommendations = recipes.slice(0, 12);

    if (recommendations.length === 0) {
      req.flash('info', 'No recipes match your preferences. Try adjusting your requirements.');
    }

    // Final check: log all recommendations
    console.log("=== FINAL RECOMMENDATIONS ===");
    recommendations.forEach((recipe: { title: string; description?: string }) => {
      console.log(`- ${recipe.title} (${recipe.description || 'No description'})`);
    });

    res.render('search', {
      about,
      recommendations,
      aiExplanation,
      positiveVibe,
      title: 'Personalized Recipe Recommendations',
      ai_enabled: true
    });
  } catch (e) {
    console.error("Error in AI recipe recommendations:", e);
    res.render('search', {
      about,
      recommendations: [],
      title: 'Personalized Recipe Recommendations',
      ai_enabled: true
    });
  }
});

// Route to render the "Create Recipe" page
app.get('/recipes/new', isAuthenticated, async (req, res) => {
  try {
    // Fetch all unique cuisines from recipes
    const cuisinesResult = await pool.query("SELECT DISTINCT cuisine FROM recipes WHERE cuisine IS NOT NULL AND cuisine <> '' ORDER BY cuisine ASC");
    const cuisines = cuisinesResult.rows.map(row => row.cuisine);
    
    console.log("Fetched cuisines for new recipe:", cuisines);
    
    res.render('new-recipe', { 
      title: 'Create Recipe', 
      cuisines, 
      user: req.user 
    });
  } catch (error) {
    console.error("Error loading cuisines:", error);
    req.flash('error', 'Failed to load cuisines');
    res.redirect('/dashboard');
  }
});

// Route to edit a recipe 
app.get('/recipes/edit/:id', isAuthenticated, async (req, res) => {
  const recipeId = req.params.id;
  const userId = (req.user as any).id;
  try {
    const recipeResult = await pool.query('SELECT * FROM recipes WHERE id = $1 AND user_id = $2', [recipeId, userId]);
    if (recipeResult.rows.length === 0) {
      req.flash('error', 'Recipe not found or you do not have permission to edit it');
      return res.redirect('/dashboard');
    }
    const recipe = recipeResult.rows[0];
    // Fetch all unique cuisines from recipes
    const cuisinesResult = await pool.query("SELECT DISTINCT cuisine FROM recipes WHERE cuisine IS NOT NULL AND cuisine <> '' ORDER BY cuisine ASC");
    const cuisines = cuisinesResult.rows.map(row => row.cuisine);
    res.render('edit-recipe', { title: 'Edit Recipe', recipe, cuisines, user: req.user });
  } catch (error) {
    console.error(error);
    req.flash('error', 'Failed to load recipe for editing');
    res.redirect('/dashboard');
  }
});

app.post('/recipes/edit/:id', isAuthenticated, async (req, res) => {
  const recipeId = req.params.id;
  const userId = (req.user as any).id;
  const { title, description, category_id, instructions, cuisine } = req.body;
  try {
    await pool.query(
      'UPDATE recipes SET title = $1, description = $2, category_id = $3, instructions = $4, cuisine = $5 WHERE id = $6 AND user_id = $7',
      [title, description, category_id || null, instructions, cuisine || null, recipeId, userId]
    );
    req.flash('success', 'Recipe updated successfully!');
    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    req.flash('error', 'Failed to update recipe');
    res.redirect(`/recipes/edit/${recipeId}`);
  }
});

// Route to delete a recipe
app.post('/recipes/delete/:id', isAuthenticated, async (req, res) => {
  const recipeId = req.params.id;
  const userId = (req.user as any).id;
  
  try {
    console.log(`Attempting to delete recipe ${recipeId} by user ${userId}`);
    
    // First verify that the recipe belongs to the current user
    const recipeResult = await pool.query(
      'SELECT user_id, title FROM recipes WHERE id = $1',
      [recipeId]
    );
    
    console.log(`Recipe lookup result: ${JSON.stringify(recipeResult.rows)}`);
    
    if (recipeResult.rows.length === 0) {
      console.log(`Recipe ${recipeId} not found`);
      req.flash('error', 'Recipe not found');
      return res.redirect('/dashboard');
    }
    
    if (recipeResult.rows[0].user_id !== userId) {
      console.log(`User ${userId} attempting to delete recipe that belongs to user ${recipeResult.rows[0].user_id}`);
      req.flash('error', 'You do not have permission to delete this recipe');
      return res.redirect('/dashboard');
    }
    
    console.log(`Deleting recipe ${recipeId}: ${recipeResult.rows[0].title}`);
    
    // Start a transaction to ensure all operations are completed or none
    await pool.query('BEGIN');
    
    try {
      // Delete associated records in recipe_ingredients first (foreign key constraint)
      const ingredientsResult = await pool.query(
        'DELETE FROM recipe_ingredients WHERE recipe_id = $1',
        [recipeId]
      );
      console.log(`Deleted ${ingredientsResult.rowCount} ingredient records`);
      
      // Delete any favorite records for this recipe
      const favoritesResult = await pool.query(
        'DELETE FROM favorites WHERE recipe_id = $1',
        [recipeId]
      );
      console.log(`Deleted ${favoritesResult.rowCount} favorite records`);
      
      // Now delete the recipe itself
      const deleteResult = await pool.query(
        'DELETE FROM recipes WHERE id = $1 AND user_id = $2 RETURNING id',
        [recipeId, userId]
      );
      
      console.log(`Recipe deletion result: ${JSON.stringify(deleteResult.rows)}`);
      
      if (deleteResult.rows.length === 0) {
        throw new Error('Recipe could not be deleted');
      }
      
      // Commit transaction
      await pool.query('COMMIT');
      
      console.log(`Successfully deleted recipe ${recipeId}`);
      req.flash('success', 'Recipe deleted successfully');
      res.redirect('/dashboard');
    } catch (error) {
      // Rollback transaction on error
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error: any) { // Type the error as 'any' to access its properties
  console.error('Error deleting recipe:', error);
  req.flash('error', 'Failed to delete recipe: ' + (error.message || 'Database error'));
  res.redirect(`/recipes/edit/${recipeId}`);
}
});

// Route to display a single recipe's details
app.get('/recipes/:id', async (req, res) => {
  const recipeId = req.params.id;
  try {
    // Fetch the recipe
    const recipeResult = await pool.query('SELECT * FROM recipes WHERE id = $1', [recipeId]);
    if (recipeResult.rows.length === 0) {
      req.flash('error', 'Recipe not found');
      return res.redirect('/recipes');
    }
    const recipe = recipeResult.rows[0];

    // Fetch ingredients
    const ingredientsResult = await pool.query(`
      SELECT i.name AS ingredient_name, ri.quantity
      FROM recipe_ingredients ri
      JOIN ingredients i ON ri.ingredient_id = i.id
      WHERE ri.recipe_id = $1
    `, [recipeId]);
    recipe.ingredients = ingredientsResult.rows;

    // Fetch instructions (if you have a separate instructions table)
    let instructions = '';
    try {
      const instrResult = await pool.query('SELECT instructions FROM recipe_instructions WHERE id = $1', [recipeId]);
      if (instrResult.rows.length > 0) {
        instructions = instrResult.rows[0].instructions;
      }
    } catch (e) {}
    recipe.instructions = instructions || recipe.instructions || '';

    // Check if favorited by current user
    let isFavorited = false;
    if (req.user) {
      const favResult = await pool.query('SELECT 1 FROM favorites WHERE user_id = $1 AND recipe_id = $2', [(req.user as any).id, recipeId]);
      isFavorited = favResult.rows.length > 0;
    }
    recipe.isFavorited = isFavorited;

    // Smart back button logic - determine the source page
    const referrer = req.get('Referer') || '';
    const queryPage = req.query.page as string; // Check if page info is passed via query param
    const searchQuery = req.query.search as string; // Get search query if provided
    
    let backButton = {
      text: 'Back to Recipes',
      url: '/recipes',
      icon: '📖'
    };

    // Determine the back button based on referrer or query parameter
    if (queryPage && typeof queryPage === 'string') {
      // If page info is passed via query, use that (most reliable)
      const userId = req.query.userId as string; // Get userId if provided
      
      switch (queryPage.toLowerCase()) {
        case 'dashboard':
        case 'profile':
          backButton = {
            text: 'Back to Dashboard',
            url: '/dashboard',
            icon: '🏠'
          };
          break;
        case 'user-profile':
          if (userId) {
            // Get the username for the back button text
            try {
              const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
              const username = userResult.rows.length > 0 ? userResult.rows[0].username : 'User';
              backButton = {
                text: `Back to ${username}'s Profile`,
                url: `/users/${userId}`,
                icon: '👤'
              };
            } catch (error) {
              console.error('Error fetching username for back button:', error);
              backButton = {
                text: 'Back to Profile',
                url: `/users/${userId}`,
                icon: '👤'
              };
            }
          } else {
            backButton = {
              text: 'Back to Profile',
              url: '/dashboard',
              icon: '👤'
            };
          }
          break;
        case 'favorites':
          backButton = {
            text: 'Back to Favorites',
            url: '/favorites',
            icon: '❤️'
          };
          break;
        case 'search':
          backButton = {
            text: 'Back to Search',
            url: '/recipes/search',
            icon: '🔍'
          };
          // If we have a search query, preserve it
          if (searchQuery && typeof searchQuery === 'string') {
            backButton.text = 'Back to Search Results';
            backButton.url = `/recipes/search?q=${encodeURIComponent(searchQuery)}`;
          }
          break;
        case 'recipes':
          backButton = {
            text: 'Back to Recipes',
            url: '/recipes',
            icon: '📖'
          };
          break;
        default:
          backButton.text = `Back to ${queryPage}`;
          backButton.url = `/${queryPage}`;
      }
    } else if (referrer) {
      // Fall back to referrer analysis
      if (referrer.includes('/dashboard') || referrer.includes('/profile')) {
        backButton = {
          text: 'Back to Dashboard',
          url: '/dashboard',
          icon: '🏠'
        };
      } else if (referrer.includes('/favorites')) {
        backButton = {
          text: 'Back to Favorites',
          url: '/favorites',
          icon: '❤️'
        };
      } else if (referrer.includes('/recipes/search') || referrer.includes('search')) {
        backButton = {
          text: 'Back to Search',
          url: '/recipes/search',
          icon: '🔍'
        };
      } else if (referrer.includes('/users/')) {
        const userIdMatch = referrer.match(/\/users\/([^\/\?]+)/);
        if (userIdMatch) {
          backButton = {
            text: 'Back to Profile',
            url: `/users/${userIdMatch[1]}`,
            icon: '👤'
          };
        }
      } else if (referrer.includes('/recipes')) {
        backButton = {
          text: 'Back to Recipes',
          url: '/recipes',
          icon: '📖'
        };
      }
    }

    res.render('recipe-detail', { 
      title: recipe.title, 
      recipe, 
      user: req.user,
      backButton 
    // Fetch comments and ratings for this recipe
    const commentsResult = await pool.query(
      `SELECT rc.*, u.username FROM recipe_comments rc
       JOIN users u ON rc.user_id = u.id
       WHERE rc.recipe_id = $1
       ORDER BY rc.created_at DESC`,
      [recipeId]
    );
    const comments = commentsResult.rows;

    // Calculate average rating (if any comments exist)
    let averageRating = null;
    if (comments.length > 0) {
      const sum = comments.reduce((acc, c) => acc + (c.rating || 0), 0);
      averageRating = (sum / comments.length).toFixed(1);
    }

    res.render('recipe-detail', {
      title: recipe.title,
      recipe,
      user: req.user,
      comments,
      averageRating,
      isAuthenticated: !!req.user,
      formatDate: (date: any) => new Date(date).toLocaleString()
    });
  } catch (error) {
    console.error(error);
    req.flash('error', 'Failed to load recipe');
    res.redirect('/recipes');
  }
});

// AFTER all specific /recipes/... routes, add the general /recipes route
// Route to render the "View Recipes" page
app.get('/recipes', async (req, res) => {
  try {
    const { q, category, cuisine } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = 15;
    const offset = (page - 1) * pageSize;
    
    // Query with average rating calculation
    let query = `
      SELECT r.*, u.username,
             COALESCE(AVG(rc.rating), 0) as average_rating,
             COUNT(rc.rating) as rating_count
      FROM recipes r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN recipe_comments rc ON r.id = rc.recipe_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (q) {
      query += ` AND (r.title ILIKE $${paramIndex} OR r.description ILIKE $${paramIndex})`;
      params.push(`%${q}%`);
      paramIndex++;
    }
    
    if (category && category !== '') {
      query += ` AND r.category_id = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    if (cuisine && cuisine !== '') {
      query += ` AND r.cuisine ILIKE $${paramIndex}`;
      params.push(`%${cuisine}%`);
      paramIndex++;
    }
    
    // Add GROUP BY clause for the aggregate functions
    query += ` GROUP BY r.id, u.username`;
    
    // Count total recipes for pagination
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
    
    const countResult = await pool.query(countQuery, params);
    const totalRecipes = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalRecipes / pageSize);
    
    // Add pagination to main query - using id for sorting instead of created_at
    query += ` ORDER BY r.id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(pageSize, offset);
    
    console.log("Executing recipe query:", query);
    console.log("With params:", params);
    
    const recipesResult = await pool.query(query, params);
    const recipes = recipesResult.rows;
    
    console.log(`Found ${recipes.length} recipes`);
    
    // Get all categories for the filter - simplified
    const categoriesResult = await pool.query('SELECT id, name FROM categories ORDER BY name');
    const categories = categoriesResult.rows;
    
    // Fetch all unique cuisines - simplified
    const cuisinesResult = await pool.query("SELECT DISTINCT cuisine FROM recipes WHERE cuisine IS NOT NULL AND cuisine <> '' ORDER BY cuisine");
    const cuisines = cuisinesResult.rows.map(row => row.cuisine);
    
    // Check if recipes are favorited by current user
    let favoriteRecipeIds = [];
    if (req.user) {
      const favResult = await pool.query(
        'SELECT recipe_id FROM favorites WHERE user_id = $1',
        [(req.user as any).id]
      );
      favoriteRecipeIds = favResult.rows.map(r => r.recipe_id);
    }
    
    // Add default ingredients for display if none found
    const defaultIngredients = [
      { name: 'eggs', quantity: null },
      { name: 'flour', quantity: null },
      { name: 'milk', quantity: null }
    ];
    
    // Prepare recipes for rendering
    const recipesWithIngredients = recipes.map(recipe => {
      return {
        ...recipe,
        ingredients: defaultIngredients, // Initialize with default ingredients
        isFavorited: favoriteRecipeIds.includes(recipe.id)
      };
    });
    
    // Render the recipes page
    res.render('recipes', {
      title: 'View Recipes',
      recipes: recipesWithIngredients,
      user: req.user,
      categories,
      cuisines,
      query: q || '',
      category: category || '',
      cuisine: cuisine || '',
      page,
      totalPages: totalPages || 1
    });
  } catch (error) {
    console.error("Error fetching recipes:", error);
    req.flash('error', 'Failed to fetch recipes');
    // Instead of sending a 500 error, render the page with an error message
    res.render('recipes', {
      title: 'View Recipes',
      recipes: [],
      user: req.user,
      categories: [],
      cuisines: [],
      query: '',
      category: '',
      cuisine: '',
      page: 1,
      totalPages: 1,
      error: 'Failed to fetch recipes'
    });
  }
});

// Route to handle recipe search
app.post('/recipes/search', async (req, res) => {
  const { q } = req.body;
  try {
    // Simple search implementation
    const searchResult = await pool.query(
      `SELECT r.*, u.username
       FROM recipes r
       JOIN users u ON r.user_id = u.id
       WHERE r.title ILIKE $1 OR r.description ILIKE $1`,
      [`%${q}%`]
    );
    const recipes = searchResult.rows;
    res.render('search', { title: 'Search Results', recipes });
  } catch (error) {
    console.error("Error searching recipes:", error);
    req.flash('error', 'Failed to search recipes');
    res.redirect('/recipes');
  }
});

// Favorites page route
app.get('/favorites', isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    
    // Get user's favorite recipes with all necessary joins
    const recipesResult = await pool.query(`
      SELECT r.*, c.name as category_name, u.username
      FROM favorites f
      JOIN recipes r ON f.recipe_id = r.id
      LEFT JOIN categories c ON r.category_id = c.id
      JOIN users u ON r.user_id = u.id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC
    `, [userId]);
    
    const recipes = recipesResult.rows;
    
    // For each recipe, fetch its ingredients
    const recipeIds = recipes.map(r => r.id);
    const ingredientsByRecipe: { [recipeId: string]: Array<{name: string; quantity: string | null}> } = {};
    
    if (recipeIds.length > 0) {
      const ingredientsResult = await pool.query(`
        SELECT ri.recipe_id, i.name AS ingredient_name, ri.quantity
        FROM recipe_ingredients ri
        JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE ri.recipe_id = ANY($1)
      `, [recipeIds]);
      
      // Group ingredients by recipe - ensure recipe_id is used as a string key
      for (const row of ingredientsResult.rows) {
        // Convert recipe_id to string to ensure consistent key usage
        const recipeIdKey = String(row.recipe_id);
        
        if (!ingredientsByRecipe[recipeIdKey]) {
          ingredientsByRecipe[recipeIdKey] = [];
        }
        
        ingredientsByRecipe[recipeIdKey].push({
          name: row.ingredient_name,
          quantity: row.quantity
        });
      }
    }
    
    // Add default ingredients if none found
    const defaultIngredients = [
      { name: 'eggs', quantity: null },
      { name: 'flour', quantity: null },
      { name: 'milk', quantity: null }
    ];
    
    // Attach ingredients to recipes - explicitly convert recipe.id to string
    const recipesWithIngredients = recipes.map(recipe => {
      // Convert recipe.id to string for consistent lookup
      const recipeIdKey = String(recipe.id);
      const ings = Array.isArray(ingredientsByRecipe[recipeIdKey]) ? ingredientsByRecipe[recipeIdKey] : [];
      
      return {
        ...recipe,
        ingredients: (ings.length > 0) ? ings : defaultIngredients
      };
    });
    
    res.render('favorites', {
      title: 'My Favorite Recipes',
      recipes: recipesWithIngredients,
      user: req.user
    });
    
  } catch (error) {
    console.error("Error fetching favorites:", error);
    req.flash('error', 'Failed to load favorite recipes');
    res.redirect('/dashboard');
  }
});

// API routes for meal plans
app.use('/api/meal-plans', mealPlanRoutes(pool));

// API routes for meal plan items (nested under meal plans)
app.use('/api/meal-plans/:mealPlanId/items', (req, res, next) => mealPlanItemRoutes(pool)(req, res, next));

// API route for generating shopping list for a meal plan
app.use('/api/meal-plans/:mealPlanId/shopping-list', (req, res, next) => shoppingListRoutes(pool)(req, res, next));

// API route for generating a combined shopping list for multiple meal plans
import { combinedShoppingListRoutes } from './routes/shoppingListRoutes';
app.use('/api/shopping-list', combinedShoppingListRoutes(pool));

// Route to render the "Meal Plans" page
app.get('/meal-plans', isAuthenticated, (req, res) => {
  res.render('meal-plans', { title: 'My Meal Plans', user: req.user });
});

// Route to render a single meal plan and its items
app.get('/meal-plans/:id', isAuthenticated, async (req, res) => {
  const mealPlanId = req.params.id;
  const userId = (req.user as any).id;
  try {
    // Get the meal plan
    const planResult = await pool.query('SELECT * FROM meal_plans WHERE id = $1 AND user_id = $2', [mealPlanId, userId]);
    if (planResult.rows.length === 0) {
      req.flash('error', 'Meal plan not found');
      return res.redirect('/meal-plans');
    }
    
    // Get both user's own recipes and favorited recipes for selection
    const recipesQuery = `
      SELECT r.id, r.title, 
        CASE WHEN r.user_id = $1 THEN 'Your Recipe' ELSE 'Favorite' END AS recipe_type
      FROM recipes r
      WHERE r.user_id = $1 -- User's own recipes
      UNION
      SELECT r.id, r.title, 'Favorite' AS recipe_type
      FROM recipes r
      JOIN favorites f ON r.id = f.recipe_id
      WHERE f.user_id = $1 -- User's favorite recipes
      ORDER BY recipe_type, title
    `;
    const recipesResult = await pool.query(recipesQuery, [userId]);
    
    // Ensure dates are proper date objects before passing to template
    const mealPlan = {
      ...planResult.rows[0],
      // Make sure dates are properly formatted
      start_date: new Date(planResult.rows[0].start_date),
      end_date: new Date(planResult.rows[0].end_date)
    };
    
    res.render('meal-plan-detail', {
      title: mealPlan.name,
      mealPlan: mealPlan,
      recipes: recipesResult.rows
    });
  } catch (error) {
    req.flash('error', 'Failed to load meal plan');
    res.redirect('/meal-plans');
  }
});

// Register the recipe comments routes
app.use('/recipes', recipeCommentsRoutes(pool));

// Start the server
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port} (with auto-reload enabled)`);
});