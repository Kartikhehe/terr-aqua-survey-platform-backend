import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import waypointsRoutes from './routes/waypoints.js';
import uploadRoutes from './routes/upload.js';
import authRoutes from './routes/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from server directory
dotenv.config({ path: join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// CORS configuration - allow both production and development origins
const allowedOrigins = [
  'https://terr-aqua-survey-platform.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null, // Vercel preview deployments
].filter(Boolean); // Remove any undefined values

// CORS configuration function
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Log for debugging
      console.log('CORS blocked origin:', origin);
      console.log('Allowed origins:', allowedOrigins);
      // In development, allow localhost origins even if not explicitly listed
      if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        console.log('Allowing localhost origin for development');
        return callback(null, true);
      }
      // Allow any Vercel deployment (for preview deployments)
      if (origin && origin.includes('vercel.app')) {
        console.log('Allowing Vercel deployment origin:', origin);
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Always set CORS headers as a fallback for any responses (including errors)
// Utility to safely set CORS headers only for allowed and valid origins
const setCorsHeadersSafe = (req, res) => {
  const incomingOrigin = req.headers.origin;
  // If there's no origin header, do not set credentialed CORS info
  if (!incomingOrigin) return false;
  // Reject origin with potentially invalid characters early
  if (typeof incomingOrigin !== 'string' || incomingOrigin.includes(',') || incomingOrigin.includes('\n') || incomingOrigin.includes('\r')) return false;
  const originAllowed = allowedOrigins.includes(incomingOrigin) || incomingOrigin.includes('localhost') || incomingOrigin.includes('127.0.0.1') || incomingOrigin.includes('vercel.app');
  if (!originAllowed) return false;
  res.header('Access-Control-Allow-Origin', incomingOrigin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Expose-Headers', 'Set-Cookie');
  return true;
};

app.use((req, res, next) => {
  setCorsHeadersSafe(req, res);
  // Log allowed origins at startup for debugging
  next();
});

// Additional middleware to ensure CORS headers are set on all responses
app.use((req, res, next) => {
  // Use centralized safe setting to avoid invalid header characters
  setCorsHeadersSafe(req, res);
  next();
});
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  // Use the same safe header setter used throughout the app
  setCorsHeadersSafe(req, res);
  res.sendStatus(204);
});

// Routes
app.use('/auth', authRoutes);
app.use('/api/waypoints', waypointsRoutes);
app.use('/api/upload', uploadRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Handle CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: Origin not allowed' });
  }
  // Ensure CORS headers are present on error responses (only if origin is allowed)
  setCorsHeadersSafe(req, res);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

