import jwt from 'jsonwebtoken';
import pool from '../database/connection.js';

export const authenticateToken = async (req, res, next) => {
  try {
    // Allow preflight requests to pass through without authentication
    if (req.method === 'OPTIONS') {
      return next();
    }
    // Get token from Authorization header or cookies
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    // Also check cookies - log for debugging
    const cookieToken = req.cookies?.token;
    
    // Debug logging (remove in production)
    if (process.env.NODE_ENV === 'development' || process.env.VERCEL) {
      console.log('Auth check - Cookies:', req.cookies);
      console.log('Auth check - Cookie token:', cookieToken ? 'Present' : 'Missing');
      console.log('Auth check - Auth header:', authHeader ? 'Present' : 'Missing');
    }

    const jwtToken = token || cookieToken;

    if (!jwtToken) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify token
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
    
    // Get user from database
    const result = await pool.query(
      'SELECT id, email, full_name, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Attach user to request
    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

