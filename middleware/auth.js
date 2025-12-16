import jwt from 'jsonwebtoken';
import pool from '../database/connection.js';

// Helper to set CORS headers on any response
const setCorsHeaders = (req, res) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://terr-aqua-survey-platform.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  const isOriginAllowed = (origin) => {
    if (!origin || typeof origin !== 'string') return false;
    if (origin.includes(',') || origin.includes('\n') || origin.includes('\r')) return false;
    if (allowedOrigins.includes(origin)) return true;
    if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('vercel.app')) return true;
    return false;
  };

  if (origin && isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }
};

export const authenticateToken = async (req, res, next) => {
  try {
    // CRITICAL: Set CORS headers on all responses
    setCorsHeaders(req, res);

    // Allow preflight requests to pass through without authentication
    if (req.method === 'OPTIONS') {
      return next();
    }

    // Get token from Authorization header or cookies
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    // Also check cookies
    const cookieToken = req.cookies?.token;
    
    // Debug logging
    if (process.env.NODE_ENV === 'development' || process.env.VERCEL) {
      console.log('Auth check - Cookies:', req.cookies);
      console.log('Auth check - Cookie token:', cookieToken ? 'Present' : 'Missing');
      console.log('Auth check - Auth header:', authHeader ? 'Present' : 'Missing');
    }

    const jwtToken = token || cookieToken;

    if (!jwtToken) {
      setCorsHeaders(req, res); // Ensure CORS on error
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify token
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set in environment variables');
      setCorsHeaders(req, res);
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
    
    // Get user from database
    const result = await pool.query(
      'SELECT id, email, full_name, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      setCorsHeaders(req, res);
      return res.status(401).json({ error: 'User not found' });
    }

    // Attach user to request
    req.user = result.rows[0];
    next();
  } catch (error) {
    setCorsHeaders(req, res); // Ensure CORS on all errors
    
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};