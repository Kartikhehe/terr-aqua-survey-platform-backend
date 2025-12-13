import express from 'express';
import pool from '../database/connection.js';
import cloudinary from '../config/cloudinary.js';
import { v2 as cloudinaryUpload } from 'cloudinary';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get default location (public endpoint, no auth required for this)
// This must be before authenticateToken middleware
router.get('/default', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM waypoints WHERE LOWER(name) = $1 LIMIT 1',
      ['default location']
    );
    
    if (result.rows.length === 0) {
      // Return fallback default location if not found in database
      return res.json({
        id: null,
        name: 'Default Location',
        latitude: 26.516654,
        longitude: 80.231507,
        notes: null,
        image_url: null,
        created_at: null,
        updated_at: null
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching default location:', error);
    // Return fallback on error
    res.json({
      id: null,
      name: 'Default Location',
      latitude: 26.516654,
      longitude: 80.231507,
      notes: null,
      image_url: null,
      created_at: null,
      updated_at: null
    });
  }
});

// All other waypoints routes require authentication
router.use(authenticateToken);

// Get all waypoints for the authenticated user (plus global Default Location)
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT * 
       FROM waypoints 
       WHERE (user_id = $1) 
          OR (LOWER(name) = 'default location' AND user_id IS NULL)
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
    const { name, latitude, longitude, notes, image_url, project_id, project_name } = req.body;
    const userId = req.user?.id;
    
    // Check if "Default Location" already exists (case-insensitive)
    if (name && name.trim().toLowerCase() === 'default location') {
      const existingCheck = await pool.query(
        'SELECT id FROM waypoints WHERE LOWER(name) = $1 AND user_id IS NULL',
        ['default location']
      );
      
      if (existingCheck.rows.length > 0) {
        // Update existing "Default Location" instead of creating a new one
        const result = await pool.query(
          `UPDATE waypoints 
           SET latitude = $1, longitude = $2, notes = $3, image_url = $4, updated_at = CURRENT_TIMESTAMP
           WHERE LOWER(name) = $5 AND user_id IS NULL
           RETURNING *`,
          [latitude, longitude, notes || null, image_url || null, 'default location']
        );
        return res.status(200).json(result.rows[0]);
      }
    }
    
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
      `INSERT INTO waypoints (name, latitude, longitude, notes, image_url, user_id, project_id, project_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, latitude, longitude, notes || null, image_url || null, userId || null, project_id || null, project_name || null]
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

// Update a waypoint (must belong to user unless it's the global Default Location)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, latitude, longitude, notes, image_url, project_id, project_name } = req.body;
    const userId = req.user?.id;
    
    // Get the current waypoint to check if it's "Default Location"
    const currentWaypoint = await pool.query(
      'SELECT name, user_id FROM waypoints WHERE id = $1',
      [id]
    );
    
    if (currentWaypoint.rows.length === 0) {
      return res.status(404).json({ error: 'Waypoint not found' });
    }
    
    const currentName = currentWaypoint.rows[0].name;
    const currentUserId = currentWaypoint.rows[0].user_id;
    const isDefaultLocation = currentName && currentName.trim().toLowerCase() === 'default location';

    // Authorization: allow updating only own waypoints, except the global Default Location
    if (!isDefaultLocation && currentUserId !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this waypoint' });
    }
    
    // If it's "Default Location", don't allow name change
    // Also check if trying to change another waypoint's name to "Default Location"
    if (isDefaultLocation && name && name.trim().toLowerCase() !== 'default location') {
      return res.status(400).json({ error: 'Cannot change the name of "Default Location"' });
    }
    
    if (!isDefaultLocation && name && name.trim().toLowerCase() === 'default location') {
      // Check if "Default Location" already exists
      const existingCheck = await pool.query(
        'SELECT id FROM waypoints WHERE LOWER(name) = $1 AND id != $2',
        ['default location', id]
      );
      
      if (existingCheck.rows.length > 0) {
        return res.status(400).json({ error: 'A waypoint named "Default Location" already exists' });
      }
    }
    
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
       SET name = $1, latitude = $2, longitude = $3, notes = $4, image_url = $5, project_id = $6, project_name = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [name, latitude, longitude, notes || null, image_url || null, project_id || null, project_name || null, id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating waypoint:', error);
    res.status(500).json({ error: 'Failed to update waypoint' });
  }
});

// Delete a waypoint (must belong to user; cannot delete global Default Location)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    // Get waypoint to check if it's "Default Location" and if it has an image
    const waypointResult = await pool.query(
      'SELECT name, image_url, user_id FROM waypoints WHERE id = $1',
      [id]
    );
    
    if (waypointResult.rows.length === 0) {
      return res.status(404).json({ error: 'Waypoint not found' });
    }
    
    // Prevent deletion of "Default Location"
    const waypointName = waypointResult.rows[0].name;
    if (waypointName && waypointName.trim().toLowerCase() === 'default location') {
      return res.status(400).json({ error: 'Cannot delete "Default Location"' });
    }

    // Authorization: allow deleting only own waypoints
    if (waypointResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this waypoint' });
    }
    
    // Delete image from Cloudinary if it exists
    if (waypointResult.rows[0].image_url) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = waypointResult.rows[0].image_url.split('/');
        const publicId = urlParts[urlParts.length - 1].split('.')[0];
        await cloudinaryUpload.uploader.destroy(publicId);
      } catch (cloudinaryError) {
        console.error('Error deleting image from Cloudinary:', cloudinaryError);
        // Continue with waypoint deletion even if image deletion fails
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

