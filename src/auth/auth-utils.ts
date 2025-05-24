import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';
import 'express-session';

// Extend the express-session types
declare module 'express-session' {
  interface SessionData {
    returnTo?: string;
  }
}

// Register new user
export async function registerUser(
  pool: Pool,
  username: string,
  email: string,
  password: string,
  bio?: string,
  profileImage?: string
): Promise<string | null> {
  try {
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user into database
    const result = await pool.query(
      `INSERT INTO users 
        (id, username, email, password, bio, profile_image, created_at) 
       VALUES 
        (gen_random_uuid(), $1, $2, $3, $4, $5, CURRENT_TIMESTAMP) 
       RETURNING id`,
      [username, email, hashedPassword, bio || null, profileImage || null]
    );

    return result.rows[0].id;
  } catch (error) {
    console.error('Error registering user:', error);
    return null;
  }
}

// Update user profile
export async function updateUserProfile(
  pool: Pool,
  userId: string,
  username?: string,
  bio?: string,
  profileImage?: string
): Promise<boolean> {
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (username) {
      updates.push(`username = $${paramCount++}`);
      values.push(username);
    }
    
    if (bio !== undefined) {
      updates.push(`bio = $${paramCount++}`);
      values.push(bio);
    }
    
    if (profileImage !== undefined) {
      updates.push(`profile_image = $${paramCount++}`);
      values.push(profileImage);
    }
    
    if (updates.length === 0) {
      return true; // Nothing to update
    }
    
    values.push(userId);

    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    return true;
  } catch (error) {
    console.error('Error updating user profile:', error);
    return false;
  }
}

// Change user password
export async function changeUserPassword(
  pool: Pool,
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Get user's current password
    const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return { success: false, message: 'User not found' };
    }
    
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, userResult.rows[0].password);
    
    if (!isMatch) {
      return { success: false, message: 'Current password is incorrect' };
    }
    
    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password in database
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);
    
    return { success: true, message: 'Password updated successfully' };
  } catch (error) {
    console.error('Error changing password:', error);
    return { success: false, message: 'An error occurred while changing password' };
  }
}

// Middleware to ensure user is authenticated
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  console.log('isAuthenticated middleware:', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    currentUrl: req.originalUrl
  });
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Store the URL the user is trying to access
  // Check if it's not a login, logout, or register URL to avoid redirect loops
  if (!['/login', '/register', '/logout'].includes(req.originalUrl)) {
    // Store the full URL including query parameters
    const fullUrl = req.originalUrl;
    req.session.returnTo = fullUrl;
    console.log('Storing returnTo URL:', fullUrl);
    
    // Create a descriptive message that indicates which page they'll return to
    const pageName = fullUrl.split('/').pop()?.split('?')[0] || 'the page';
    const customMessage = `Please log in to access ${pageName}`;
    req.flash('redirect', customMessage);
  }
  
  res.redirect('/login');
}

// Middleware to ensure user is NOT authenticated (for login/register pages)
export function isNotAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return next();
  }
  
  // For authenticated users, determine where to redirect them
  
  // First priority: returnTo in query string (explicit redirection)
  if (req.query.returnTo) {
    const redirectUrl = req.query.returnTo as string;
    console.log('Redirecting already authenticated user to query param destination:', redirectUrl);
    return res.redirect(redirectUrl);
  }
  
  // Second priority: returnTo in session (saved from previous navigation)
  if (req.session.returnTo) {
    const redirectUrl = req.session.returnTo;
    console.log('Redirecting already authenticated user to session-saved destination:', redirectUrl);
    delete req.session.returnTo; // Clear the returnTo
    return res.redirect(redirectUrl);
  }
  
  // Last resort: redirect to profile page
  console.log('No redirect destination found, sending to profile page');
  res.redirect('/profile');
}