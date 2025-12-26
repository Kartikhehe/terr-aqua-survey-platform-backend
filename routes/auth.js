import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import pool from '../database/connection.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

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

// Middleware to set CORS headers on all auth routes
router.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  next();
});

// Helper: Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper: Send OTP Email
const sendOTPEmail = async (email, otp) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev', // Update with your verify domain or use onboarding@resend.dev for testing
      to: [email],
      subject: 'Verify your TerrAqua Account',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #0891B2;">Verify Your Email</h2>
          <p>Thanks for signing up for TerrAqua MapZest Survey Platform! Please use the following One-Time Password (OTP) to verify your account:</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; font-size: 24px; letter-spacing: 5px; font-weight: bold; margin: 20px 0;">
            ${otp}
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
        </div>
      `
    });

    if (error) {
      console.error('Resend API Error:', error);
      throw new Error('Failed to send verification email');
    }
    return data;
  } catch (err) {
    console.error('Email sending failed:', err);
    throw err;
  }
};

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

    const lowerEmail = email.toLowerCase();

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id, is_verified FROM users WHERE email = $1',
      [lowerEmail]
    );

    if (existingUser.rows.length > 0) {
      if (existingUser.rows[0].is_verified) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }
      // If user exists but not verified, we'll allow re-registering/updating (conceptually)
      // or just tell them to verify. For simplicity, we delete unverified and recreate
      // OR we just update the password and resend OTP.
      // Let's UPDATE password just in case they forgot it, and resend.
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      await pool.query(
        'UPDATE users SET password_hash = $1, full_name = $2 WHERE email = $3',
        [passwordHash, full_name, lowerEmail]
      );
    } else {
      // Create new user
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      await pool.query(
        'INSERT INTO users (email, password_hash, full_name, is_verified) VALUES ($1, $2, $3, $4)',
        [lowerEmail, passwordHash, full_name, false]
      );
    }

    // Generate and Store OTP
    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

    // Expires in 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Upsert OTP
    await pool.query(
      `INSERT INTO email_otps (email, otp_hash, expires_at) 
       VALUES ($1, $2, $3)
       ON CONFLICT (email) 
       DO UPDATE SET otp_hash = $2, expires_at = $3`,
      [lowerEmail, otpHash, expiresAt]
    );

    // Send Email
    await sendOTPEmail(lowerEmail, otp);

    res.status(201).json({
      message: 'Signup successful. Please verify your email with the OTP sent.',
      email: lowerEmail,
      requiresVerification: true
    });

  } catch (error) {
    console.error('Signup error:', error);

    if (error.code === '23505') {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
});

// Verify OTP Route
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const lowerEmail = email.toLowerCase();

    // Fetch OTP record
    const otpRecord = await pool.query(
      'SELECT otp_hash, expires_at FROM email_otps WHERE email = $1',
      [lowerEmail]
    );

    if (otpRecord.rows.length === 0) {
      return res.status(400).json({ error: 'No OTP found. Please request a new one.' });
    }

    const { otp_hash, expires_at } = otpRecord.rows[0];

    // Check expiration
    if (new Date() > new Date(expires_at)) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    // Verify OTP
    const isValid = await bcrypt.compare(otp, otp_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Mark user as verified
    const userResult = await pool.query(
      'UPDATE users SET is_verified = TRUE WHERE email = $1 RETURNING id, email, full_name, created_at',
      [lowerEmail]
    );

    // Clean up OTP
    await pool.query('DELETE FROM email_otps WHERE email = $1', [lowerEmail]);

    const user = userResult.rows[0];

    // Generate JWT (Same logic as login)
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET not configured');
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set Cookie (Reused logic for cookie settings)
    const isVercelDeployment = process.env.VERCEL || req.hostname.includes('vercel.app');
    const requestOrigin = req.headers.origin;
    const isCrossOrigin = isVercelDeployment ||
      (requestOrigin && !requestOrigin.includes(req.hostname));

    if (requestOrigin && isOriginAllowed(requestOrigin)) {
      res.header('Access-Control-Allow-Origin', requestOrigin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    const cookieOptions = {
      httpOnly: true,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };

    if (isVercelDeployment || isCrossOrigin) {
      res.cookie('token', token, { ...cookieOptions, secure: true, sameSite: 'none' });
    } else {
      res.cookie('token', token, { ...cookieOptions, secure: false, sameSite: 'lax' });
    }

    res.json({
      message: 'Email verified successfully',
      token,
      user
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Resend OTP Route
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const lowerEmail = email.toLowerCase();

    // Check user exists
    const userResult = await pool.query('SELECT id, is_verified FROM users WHERE email = $1', [lowerEmail]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (userResult.rows[0].is_verified) {
      return res.status(400).json({ error: 'User is already verified. Please login.' });
    }

    // Generate & Store new OTP
    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO email_otps (email, otp_hash, expires_at) 
       VALUES ($1, $2, $3)
       ON CONFLICT (email) 
       DO UPDATE SET otp_hash = $2, expires_at = $3`,
      [lowerEmail, otpHash, expiresAt]
    );

    // Send Email
    await sendOTPEmail(lowerEmail, otp);

    res.json({ message: 'New OTP sent to your email.' });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Debug logging
    console.log('Login attempt - Origin:', req.headers.origin);
    console.log('Login attempt - Hostname:', req.hostname);
    console.log('Login attempt - Cookies:', req.cookies);

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get user from database
    const result = await pool.query(
      'SELECT id, email, password_hash, full_name, is_verified, created_at FROM users WHERE email = $1',
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

    // Check if email is verified
    if (!user.is_verified) {
      return res.status(403).json({
        error: 'Email not verified. Please check your email for the verification code.',
        requiresVerification: true,
        email: user.email
      });
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
    // When backend is on Vercel, always use cross-origin cookie settings
    // because frontend may be on localhost or different domain
    const isVercelDeployment = process.env.VERCEL || req.hostname.includes('vercel.app');
    const requestOrigin = req.headers.origin;
    // Check if request is cross-origin (different domain/subdomain)
    const isCrossOrigin = isVercelDeployment ||
      (requestOrigin && requestOrigin !== `http://${req.hostname}` &&
        requestOrigin !== `https://${req.hostname}` &&
        !requestOrigin.includes(req.hostname));

    // Debug logging
    console.log('Setting cookie - isVercelDeployment:', isVercelDeployment);
    console.log('Setting cookie - requestOrigin:', requestOrigin);
    console.log('Setting cookie - hostname:', req.hostname);
    console.log('Setting cookie - isCrossOrigin:', isCrossOrigin);

    // For Vercel deployment or cross-origin: always use 'none' and 'secure: true'
    // For localhost same-origin: use 'lax' and 'secure: false'
    if (isVercelDeployment || isCrossOrigin) {
      // Ensure CORS headers are set before setting cookie
      if (requestOrigin && isOriginAllowed(requestOrigin)) {
        res.header('Access-Control-Allow-Origin', requestOrigin);
        res.header('Access-Control-Allow-Credentials', 'true');
      }

      // Cross-origin requires 'none' and 'secure: true'
      res.cookie('token', token, {
        httpOnly: true,
        secure: true, // Required when sameSite is 'none'
        sameSite: 'none', // Required for cross-origin requests
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
        // Don't set domain - let browser handle it for cross-origin
      });
      console.log('Cookie set with sameSite: none, secure: true');
    } else {
      // Local development - same origin
      res.cookie('token', token, {
        httpOnly: true,
        secure: false, // Not needed for localhost
        sameSite: 'lax', // Works for same-origin
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });
      console.log('Cookie set with sameSite: lax, secure: false');
    }

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
  // Clear cookie with various possible options to ensure it's removed
  // regardless of environment alignment (local vs prod vs cross-origin)

  // 1. Clear with production/cross-origin settings
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/'
  });

  // 2. Clear with local/same-origin settings
  res.clearCookie('token', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/'
  });

  // 3. Clear with minimal settings
  res.clearCookie('token', {
    path: '/'
  });

  res.json({ message: 'Logout successful' });
});

export default router;
