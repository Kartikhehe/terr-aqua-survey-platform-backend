import express from 'express';
import cloudinary from '../config/cloudinary.js';
import { v2 as cloudinaryUpload } from 'cloudinary';
import multer from 'multer';
import { Readable } from 'stream';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Middleware to set CORS headers on all upload routes
router.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://terr-aqua-survey-platform.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
  ].filter(Boolean);
  
  const isAllowed = !origin || 
                   allowedOrigins.includes(origin) ||
                   (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) ||
                   (origin && origin.includes('vercel.app'));
  
  if (isAllowed && origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }
  
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
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Handle preflight requests specifically for upload
router.options('/', (req, res) => {
  const origin = req.headers.origin || '';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.sendStatus(204);
});

export default router;

