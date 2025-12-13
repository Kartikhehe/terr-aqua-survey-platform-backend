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

// Middleware to set CORS headers on all upload routes
router.use((req, res, next) => {
  const origin = req.headers.origin;
  
  const isAllowed = !origin || isOriginAllowed(origin);
  
  if (isAllowed && origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }
  
  next();
});

// Diagnostic: log all incoming requests to this router for debugging
router.use((req, res, next) => {
  const origin = req.headers.origin || '';
  const userAgent = req.headers['user-agent'] || '';
  console.log(`[Upload] ${req.method} ${req.originalUrl} - origin: ${origin} - ua: ${userAgent}`);
  next();
});

// Upload route requires authentication
router.use(authenticateToken);

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

// Upload image to Cloudinary
router.post('/', upload.single('image'), async (req, res) => {
  const origin = req.headers.origin || '';
  // If Cloudinary environment variables are missing, fail early with a clear error (and CORS headers)
  const missingCloudinary = !process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET;
  if (missingCloudinary) {
    console.error('Cloudinary environment variables are missing. Upload cannot proceed.');
    if (isOriginAllowed(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }
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
          return res.status(500).json({ error: 'Failed to upload image to Cloudinary' });
        }
        
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
    // Make sure CORS headers are included even on error (only for allowed origins)
    if (isOriginAllowed(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Handle preflight requests specifically for upload
router.options('/', (req, res) => {
  const origin = req.headers.origin || '';
  if (isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }
  res.sendStatus(204);
});

// Simple test route for confirming upload endpoint and CORS (GET)
router.get('/test', (req, res) => {
  const origin = req.headers.origin || '';
  if (isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.json({ ok: true, message: 'Upload endpoint reachable' });
});

export default router;

