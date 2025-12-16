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

// CRITICAL: This must be the FIRST middleware to ensure CORS on ALL responses
const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;

  console.log('[CORS] Request from origin:', origin);

  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    console.log('[CORS] Headers set for origin:', origin);
  } else {
    console.log('[CORS] Origin not allowed or missing:', origin);
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    console.log('[CORS] Handling OPTIONS preflight');
    return res.status(204).end();
  }

  next();
};

// Apply CORS as the FIRST middleware
router.use(corsMiddleware);

// Diagnostic logging
router.use((req, res, next) => {
  console.log(`[Upload] ${req.method} ${req.originalUrl}`);
  console.log('[Upload] Origin:', req.headers.origin);
  console.log('[Upload] Auth header:', req.headers.authorization ? 'Present' : 'Missing');
  next();
});

// Test endpoint WITHOUT authentication (for CORS testing)
router.get('/test', (req, res) => {
  console.log('[Upload] Test endpoint hit');
  res.json({
    ok: true,
    message: 'Upload endpoint reachable',
    corsHeaders: {
      origin: res.getHeader('Access-Control-Allow-Origin'),
      credentials: res.getHeader('Access-Control-Allow-Credentials'),
    }
  });
});

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

// Wrap authenticateToken to ensure it doesn't break CORS
const authWrapper = (req, res, next) => {
  authenticateToken(req, res, (err) => {
    if (err || !req.user) {
      console.log('[Upload] Authentication failed');
      // CORS headers already set by corsMiddleware
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.log('[Upload] Authentication successful, user:', req.user.id);
    next();
  });
};

// Upload route with authentication
router.post('/', authWrapper, upload.single('image'), async (req, res) => {
  console.log('[Upload] POST handler started');

  // Check Cloudinary configuration
  const missingCloudinary = !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET;

  if (missingCloudinary) {
    console.error('[Upload] Cloudinary environment variables missing');
    return res.status(500).json({ error: 'Cloudinary not configured. Uploads are disabled.' });
  }

  try {
    if (!req.file) {
      console.log('[Upload] No file provided');
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('[Upload] Processing file:', req.file.originalname, 'Size:', req.file.size);

    // Convert buffer to stream and upload
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
          console.error('[Upload] Cloudinary upload error:', error);
          return res.status(500).json({ error: 'Failed to upload image to Cloudinary' });
        }

        console.log('[Upload] Upload successful:', result.secure_url);
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
    console.error('[Upload] Error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

export default router;