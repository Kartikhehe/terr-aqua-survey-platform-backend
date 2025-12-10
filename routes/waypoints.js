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

// Get all waypoints
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM waypoints ORDER BY created_at DESC'
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

// Create a new waypoint
router.post('/', async (req, res) => {
  try {
    const { name, latitude, longitude, notes, image_url } = req.body;
    
    // Check if "Default Location" already exists (case-insensitive)
    if (name && name.trim().toLowerCase() === 'default location') {
      const existingCheck = await pool.query(
        'SELECT id FROM waypoints WHERE LOWER(name) = $1',
        ['default location']
      );
      
      if (existingCheck.rows.length > 0) {
        // Update existing "Default Location" instead of creating a new one
        const result = await pool.query(
          `UPDATE waypoints 
           SET latitude = $1, longitude = $2, notes = $3, image_url = $4, updated_at = CURRENT_TIMESTAMP
           WHERE LOWER(name) = $5
           RETURNING *`,
          [latitude, longitude, notes || null, image_url || null, 'default location']
        );
        return res.status(200).json(result.rows[0]);
      }
    }
    
    const result = await pool.query(
      `INSERT INTO waypoints (name, latitude, longitude, notes, image_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, latitude, longitude, notes || null, image_url || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating waypoint:', error);
    res.status(500).json({ error: 'Failed to create waypoint' });
  }
});

// Update a waypoint
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, latitude, longitude, notes, image_url } = req.body;
    
    // Get the current waypoint to check if it's "Default Location"
    const currentWaypoint = await pool.query(
      'SELECT name FROM waypoints WHERE id = $1',
      [id]
    );
    
    if (currentWaypoint.rows.length === 0) {
      return res.status(404).json({ error: 'Waypoint not found' });
    }
    
    const currentName = currentWaypoint.rows[0].name;
    const isDefaultLocation = currentName && currentName.trim().toLowerCase() === 'default location';
    
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
    
    const result = await pool.query(
      `UPDATE waypoints 
       SET name = $1, latitude = $2, longitude = $3, notes = $4, image_url = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name, latitude, longitude, notes || null, image_url || null, id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating waypoint:', error);
    res.status(500).json({ error: 'Failed to update waypoint' });
  }
});

// Delete a waypoint
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get waypoint to check if it's "Default Location" and if it has an image
    const waypointResult = await pool.query(
      'SELECT name, image_url FROM waypoints WHERE id = $1',
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

