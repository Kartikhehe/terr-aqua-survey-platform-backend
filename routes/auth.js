import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../database/connection.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Signup route
router.post('/signup', async (req, res) => {
  try {
    const { email, password, full_name } = req.body;

    // Validation
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, password, and full name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, created_at',
      [email.toLowerCase(), passwordHash, full_name]
    );

    const user = result.rows[0];

    // Generate JWT token
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error. Please contact administrator.' });
    }
    
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        created_at: user.created_at
      },
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    
    // Provide more detailed error message
    if (error.code === '23505') {
      // PostgreSQL unique constraint violation
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    if (error.code === '23502') {
      // PostgreSQL not null constraint violation
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Database connection errors
    if (error.code === 'ENOTFOUND') {
      return res.status(500).json({ 
        error: 'Database connection failed',
        message: 'Cannot connect to database. Please check your DATABASE_URL in server/.env file.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    if (error.message && error.message.includes('placeholder')) {
      return res.status(500).json({ 
        error: 'Database configuration error',
        message: 'Your DATABASE_URL contains placeholder values. Please update server/.env with your actual database credentials.'
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get user from database
    const result = await pool.query(
      'SELECT id, email, password_hash, full_name, created_at FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error. Please contact administrator.' });
    }
    
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        created_at: user.created_at
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    
    // Provide more helpful error messages
    if (error.code === 'ENOTFOUND') {
      return res.status(500).json({ 
        error: 'Database connection failed',
        message: 'Cannot connect to database. Please check your DATABASE_URL in server/.env file.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    if (error.message && error.message.includes('placeholder')) {
      return res.status(500).json({ 
        error: 'Database configuration error',
        message: 'Your DATABASE_URL contains placeholder values. Please update server/.env with your actual database credentials.'
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred while processing your request'
    });
  }
});

// Get current user route
router.get('/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.full_name,
      created_at: req.user.created_at
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout route
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout successful' });
});

export default router;

