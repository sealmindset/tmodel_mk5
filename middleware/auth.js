/**
 * Authentication Middleware
 */

// Simple authentication middleware
const ensureAuthenticated = (req, res, next) => {
  // For the status endpoint, we'll skip auth to ensure it's always accessible
  if (req.path === '/status') {
    return next();
  }

  // If this is a session-based auth system
  if (req.session && req.session.user) {
    return next();
  }
  
  // API requests should return JSON error
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // For regular requests, redirect to login
  res.redirect('/login');
};

module.exports = { ensureAuthenticated };
