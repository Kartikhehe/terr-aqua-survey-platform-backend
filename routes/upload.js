import express from 'express';
import cloudinary from '../config/cloudinary.js';
import { v2 as cloudinaryUpload } from 'cloudinary';
import multer from 'multer';
import { Readable } from 'stream';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

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

// CRITICAL: Set CORS headers on EVERY response (including errors)
const setCorsHeaders = (req, res) => {
  const origin = req.headers.origin;

  if (origin && isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }
};

// Apply CORS headers to all routes in this router
router.use((req, res, next) => {
  setCorsHeaders(req, res);
  next();
});

// Diagnostic logging
router.use((req, res, next) => {
  const origin = req.headers.origin || '';
  const userAgent = req.headers['user-agent'] || '';
  console.log(`[Upload] ${req.method} ${req.originalUrl} - origin: ${origin} - ua: ${userAgent}`);
  next();
});

// Handle preflight requests BEFORE authentication
router.options('/', (req, res) => {
  setCorsHeaders(req, res);
  res.sendStatus(204);
});

// Handle preflight for test endpoint
router.options('/test', (req, res) => {
  setCorsHeaders(req, res);
  res.sendStatus(204);
});

// Test endpoint WITHOUT authentication for CORS testing
router.get('/test', (req, res) => {
  setCorsHeaders(req, res);
  res.json({ ok: true, message: 'Upload endpoint reachable' });
});

// Custom authentication middleware that preserves CORS headers on error
const authenticateWithCors = (req, res, next) => {
  setCorsHeaders(req, res);

  // Call the original auth middleware
  authenticateToken(req, res, (err) => {
    if (err) {
      // Ensure CORS headers are set even on auth failure
      setCorsHeaders(req, res);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if auth failed (no user)
    if (!req.user) {
      setCorsHeaders(req, res);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  });
};

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// Upload route with authentication
router.post('/', authenticateWithCors, upload.single('image'), async (req, res) => {
  setCorsHeaders(req, res);

  const origin = req.headers.origin || '';

  // Check Cloudinary configuration
  const missingCloudinary = !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET;

  if (missingCloudinary) {
    console.error('Cloudinary environment variables are missing. Upload cannot proceed.');
    return res.status(500).json({ error: 'Cloudinary not configured. Uploads are disabled.' });
  }

  console.log('Upload request from origin:', origin, 'method:', req.method, 'user-id:', req.user?.id || 'no-user');

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Convert buffer to stream
    const stream = cloudinaryUpload.uploader.upload_stream(
      {
        folder: 'navigation-tracking',
        resource_type: 'image',
        transformation: [
          { quality: 'auto' },
          { fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          setCorsHeaders(req, res);
          return res.status(500).json({ error: 'Failed to upload image to Cloudinary' });
        }

        setCorsHeaders(req, res);
        res.json({
          image_url: result.secure_url,
          public_id: result.public_id
        });
      }
    );

    // Pipe the buffer to the stream
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);
    bufferStream.pipe(stream);

  } catch (error) {
    console.error('Error uploading image:', error);
    setCorsHeaders(req, res);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

export default router;