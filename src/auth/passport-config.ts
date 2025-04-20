import { Strategy as LocalStrategy } from 'passport-local';
import { PassportStatic } from 'passport';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';

export default function configurePassport(passport: PassportStatic, pool: Pool): void {
  // Configure passport to use local strategy (username/password)
  passport.use(
    new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
      try {
        // Check if user exists
        const userQuery = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (userQuery.rows.length === 0) {
          return done(null, false, { message: 'No user found with that email' });
        }

        const user = userQuery.rows[0];
        
        // Check password - currently stored as plaintext in demo, but will use bcrypt
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
          return done(null, false, { message: 'Incorrect password' });
        }
        
        // Update last login time
        await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
        
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );

  // Serialize user for session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id, done) => {
    try {
      const result = await pool.query(
        'SELECT id, username, email, created_at, profile_image, bio FROM users WHERE id = $1', 
        [id]
      );
      
      if (result.rows.length === 0) {
        return done(null, false);
      }
      
      done(null, result.rows[0]);
    } catch (error) {
      done(error);
    }
  });
}