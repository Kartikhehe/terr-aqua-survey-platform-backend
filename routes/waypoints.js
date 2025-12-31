import express from 'express';
import pool from '../database/connection.js';
import cloudinary from '../config/cloudinary.js';
import { v2 as cloudinaryUpload } from 'cloudinary';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();



// All other waypoints routes require authentication
router.use(authenticateToken);

// Get all waypoints for the authenticated user
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT * 
       FROM waypoints 
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching waypoints:', error);
    res.status(500).json({ error: 'Failed to fetch waypoints' });
  }
});

// Get a single waypoint by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM waypoints WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Waypoint not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching waypoint:', error);
    res.status(500).json({ error: 'Failed to fetch waypoint' });
  }
});

// Create a new waypoint (user-specific)
router.post('/', async (req, res) => {
  try {
    const { name, latitude, longitude, notes, image_url, images, project_id, project_name } = req.body;
    // Support both old (image_url) and new (images array) format
    const imagesArray = images || (image_url ? [{ url: image_url, uploaded_at: new Date().toISOString() }] : []);
    const userId = req.user?.id;



    // If part of a project, ensure name uniqueness within project for this user
    if (project_id) {
      const existingCheck = await pool.query(
        'SELECT id FROM waypoints WHERE project_id = $1 AND user_id = $2 AND LOWER(name) = $3',
        [project_id, userId, name.trim().toLowerCase()]
      );
      if (existingCheck.rows.length > 0) {
        return res.status(400).json({ error: 'A waypoint with this name already exists in the project' });
      }
    }

    const result = await pool.query(
      `INSERT INTO waypoints (name, latitude, longitude, notes, image_url, images, user_id, project_id, project_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [name, latitude, longitude, notes || null, image_url || null, JSON.stringify(imagesArray), userId || null, project_id || null, project_name || null]
    );

    res.status(201).json(result.rows[0]);
    // Update project's last_activity timestamp if project_id provided
    if (project_id) {
      try {
        await pool.query('UPDATE projects SET last_activity = CURRENT_TIMESTAMP, auto_paused = FALSE WHERE id = $1', [project_id]);
      } catch (err) {
        console.error('Error updating project last_activity:', err);
      }
    }
  } catch (error) {
    console.error('Error creating waypoint:', error);
    res.status(500).json({ error: 'Failed to create waypoint' });
  }
});

// Update a waypoint (must belong to user)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, latitude, longitude, notes, image_url, images, project_id, project_name } = req.body;
    // Support both old (image_url) and new (images array) format
    const imagesArray = images || (image_url ? [{ url: image_url, uploaded_at: new Date().toISOString() }] : []);
    const userId = req.user?.id;



    // If updating project membership ensure unique name within project
    if (project_id && name) {
      const existingCheck = await pool.query(
        'SELECT id FROM waypoints WHERE project_id = $1 AND user_id = $2 AND LOWER(name) = $3 AND id != $4',
        [project_id, userId, name.trim().toLowerCase(), id]
      );
      if (existingCheck.rows.length > 0) {
        return res.status(400).json({ error: 'A waypoint with this name already exists in the project' });
      }
    }

    const result = await pool.query(
      `UPDATE waypoints 
       SET name = $1, latitude = $2, longitude = $3, notes = $4, image_url = $5, images = $6, project_id = $7, project_name = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND user_id = $10
       RETURNING *`,
      [name, latitude, longitude, notes || null, image_url || null, JSON.stringify(imagesArray), project_id || null, project_name || null, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized or waypoint not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating waypoint:', error);
    res.status(500).json({ error: 'Failed to update waypoint' });
  }
});

// Delete a waypoint (must belong to user)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Get waypoint to check if it's "Default Location" and if it has images
    const waypointResult = await pool.query(
      'SELECT name, image_url, images, user_id FROM waypoints WHERE id = $1',
      [id]
    );

    if (waypointResult.rows.length === 0) {
      return res.status(404).json({ error: 'Waypoint not found' });
    }

    const waypointName = waypointResult.rows[0].name;

    // Authorization: allow deleting only own waypoints
    if (waypointResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this waypoint' });
    }

    // Delete all images from Cloudinary if they exist
    const images = waypointResult.rows[0].images || [];
    if (images.length > 0) {
      for (const image of images) {
        try {
          if (image.public_id) {
            await cloudinaryUpload.uploader.destroy(image.public_id);
          } else if (image.url) {
            // Extract public_id from URL if not stored
            const urlParts = image.url.split('/');
            const publicId = urlParts[urlParts.length - 1].split('.')[0];
            await cloudinaryUpload.uploader.destroy(publicId);
          }
        } catch (cloudinaryError) {
          console.error('Error deleting image from Cloudinary:', cloudinaryError);
          // Continue with next image
        }
      }
    }
    // Also delete old single image_url if it exists (backward compatibility)
    else if (waypointResult.rows[0].image_url) {
      try {
        const urlParts = waypointResult.rows[0].image_url.split('/');
        const publicId = urlParts[urlParts.length - 1].split('.')[0];
        await cloudinaryUpload.uploader.destroy(publicId);
      } catch (cloudinaryError) {
        console.error('Error deleting image from Cloudinary:', cloudinaryError);
      }
    }

    // Delete waypoint from database
    const result = await pool.query(
      'DELETE FROM waypoints WHERE id = $1 RETURNING *',
      [id]
    );

    res.json({ message: 'Waypoint deleted successfully', waypoint: result.rows[0] });
  } catch (error) {
    console.error('Error deleting waypoint:', error);
    res.status(500).json({ error: 'Failed to delete waypoint' });
  }
});

export default router;

