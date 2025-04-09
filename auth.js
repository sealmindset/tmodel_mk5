const redis = require('redis');
const bcrypt = require('bcrypt');

// Redis client setup
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

const client = redis.createClient({
  socket: {
    host: redisHost,
    port: redisPort,
  },
  password: process.env.REDIS_PASSWORD,
});

client.on('error', (err) => {
  console.error('Redis error: ', err);
});

client
  .connect()
  .then(() => console.log('Connected to Redis successfully!'))
  .catch(console.error);

// Flag to track if the bypass warning has been logged already
let bypassWarningLogged = false;

module.exports = (app) => {
  // Helper function to get user by email
  const getUserByEmail = async (email) => {
    try {
      const user = await client.hGetAll(`user:${email}`);
      if (Object.keys(user).length === 0) {
        return null;
      }
      return user;
    } catch (err) {
      console.error('Error fetching user:', err);
      return null;
    }
  };

  // Middleware to check if user is authenticated - BYPASS MODE
  const ensureAuthenticated = (req, res, next) => {
    // Only log the bypass warning once per server startup
    if (!bypassWarningLogged) {
      console.log('AUTH BYPASS: Auto-logging in user for all requests');
      bypassWarningLogged = true;
    }
    
    // Always bypass authentication - USE THIS ONLY TEMPORARILY!
    req.user = {
      name: 'Temporary User',
      email: 'admin@example.com',
      registered: 'true',
      role: 'admin'
    };
    
    // Store user in session too for consistency
    req.session.user = req.user;
    
    // Always allow access
    return next();
  };

  // Login route
  app.get('/login', (req, res) => {
    res.render('login');
  });

  app.post('/login', async (req, res) => {
    console.log('Login attempt - Request body:', req.body);
    console.log('Content-Type:', req.headers['content-type']);
    
    // Extract credentials from request body
    const email = req.body.email;
    const password = req.body.password;
    
    console.log('Extracted email:', email, 'password length:', password ? password.length : 0);
    
    if (!email || !password) {
      console.error('Missing email or password');
      if (req.headers['content-type']?.includes('application/json')) {
        return res.status(400).json({ error: 'Email and password are required' });
      } else {
        return res.render('login', { error: 'Email and password are required' });
      }
    }
    
    try {
      console.log('Attempting to get user by email:', email);
      const user = await getUserByEmail(email);
      
      console.log('User found?', user ? 'Yes' : 'No');
      if (!user) {
        console.log('User not found for email:', email);
        if (req.headers['content-type']?.includes('application/json')) {
          return res.status(401).json({ error: 'Invalid email or password' });
        } else {
          return res.render('login', { error: 'Invalid email or password' });
        }
      }
      
      console.log('User data:', { ...user, hashedPassword: '[REDACTED]' });
      
      console.log('Comparing passwords for user:', email);
      const passwordMatch = await bcrypt.compare(password, user.hashedPassword);
      console.log('Password match?', passwordMatch ? 'Yes' : 'No');
      
      if (!passwordMatch) {
        console.log('Password does not match for user:', email);
        if (req.headers['content-type']?.includes('application/json')) {
          return res.status(401).json({ error: 'Invalid email or password' });
        } else {
          return res.render('login', { error: 'Invalid email or password' });
        }
      }
      
      // Store user in session
      console.log('Setting session user data:', { ...user, hashedPassword: '[REDACTED]' });
      req.session.user = user;
      
      // Force session save and handle redirection
      req.session.save((err) => {
        if (err) {
          console.error('Error saving session:', err);
          if (req.headers['content-type']?.includes('application/json')) {
            return res.status(500).json({ error: 'Session error occurred. Please try again.' });
          } else {
            return res.render('login', { error: 'Session error occurred. Please try again.' });
          }
        }
        
        console.log('User logged in successfully:', user.email, 'Session ID:', req.session.id);
        
        if (req.headers['content-type']?.includes('application/json')) {
          return res.status(200).json({ success: true, redirectUrl: '/' });
        } else {
          return res.redirect('/');
        }
      });
      
    } catch (error) {
      console.error('Login error:', error);
      if (req.headers['content-type']?.includes('application/json')) {
        return res.status(500).json({ error: 'An error occurred during login' });
      } else {
        return res.status(500).render('login', { error: 'An error occurred during login' });
      }
    }
  });

  // Add a debug route to check login status
  app.get('/login-status', (req, res) => {
    console.log('Session at /login-status:', req.session);
    console.log('User at /login-status:', req.session.user);
    
    // Return plain session status for debugging
    res.json({
      authenticated: !!req.session.user,
      sessionId: req.session.id,
      sessionAge: req.session.cookie?.maxAge,
      userDetails: req.session.user ? {
        email: req.session.user.email,
        name: req.session.user.name
      } : null
    });
  });
  
  // Logout route
  app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Error during logout:', err);
      }
      console.log('User logged out successfully');
      res.redirect('/');
    });
  });

  // Register routes
  app.get('/register', (req, res) => {
    res.render('register');
  });

  app.post('/register', async (req, res) => {
    const { name, email, apiKey, password } = req.body;

    try {
      const userId = `user:${email}`;
      const userExists = await client.exists(userId);

      if (userExists) {
        return res.render('register', { showModal: true });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      await client.hSet(userId, {
        name,
        email,
        apiKey,
        hashedPassword,
        registered: 'true',
      });

      console.log(`User registered with email: ${email}`);
      res.redirect('/login');
    } catch (error) {
      console.error('Error registering user:', error);
      res.status(500).send('Error registering user.');
    }
  });

  // Expose the middleware for use in app.js
  return { ensureAuthenticated };
};
