import express from 'express';
import pool from '../database/connection.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All project routes require authentication
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get active project for user
router.get('/active', async (req, res) => {
  try {
    const userId = req.user?.id;
    // Find project with playing status
    const playing = await pool.query('SELECT * FROM projects WHERE user_id = $1 AND status = $2 LIMIT 1', [userId, 'playing']);
    if (playing.rows.length === 0) return res.json({ project: null });
    const project = playing.rows[0];
    // Check for inactivity (6 hours)
    if (project.last_activity) {
      const lastAct = new Date(project.last_activity);
      const sixHours = 1000 * 60 * 60 * 6;
      if ((Date.now() - lastAct.getTime()) > sixHours) {
        // Auto-pause
        // Update elapsed_seconds using started_at
        let elapsed = project.elapsed_seconds || 0;
        if (project.started_at) {
          const startedAt = new Date(project.started_at);
          elapsed += Math.floor((Date.now() - startedAt.getTime()) / 1000);
        }
        await pool.query(`UPDATE projects SET status = $1, started_at = NULL, elapsed_seconds = $2, auto_paused = TRUE WHERE id = $3`, ['paused', elapsed, project.id]);
        project.status = 'paused';
        project.auto_paused = true;
        project.started_at = null;
        project.elapsed_seconds = elapsed;
      }
    }
    // Attach waypoints
    const waypoints = await pool.query('SELECT * FROM waypoints WHERE project_id = $1 ORDER BY created_at', [project.id]);
    res.json({ project: { ...project, waypoints: waypoints.rows } });
  } catch (error) {
    console.error('Error fetching active project:', error);
    res.status(500).json({ error: 'Failed to fetch active project' });
  }
});

// Create a project
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user?.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    // Ensure unique project name for user
    const existing = await pool.query(
      'SELECT id FROM projects WHERE user_id = $1 AND LOWER(name) = $2',
      [userId, name.trim().toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Project with this name already exists' });
    }

    const result = await pool.query(
      `INSERT INTO projects (name, user_id) VALUES ($1, $2) RETURNING *`,
      [name.trim(), userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project status (play/pause/end)
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'playing' | 'paused' | 'ended'
    const userId = req.user?.id;
    if (!['playing', 'paused', 'ended'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    // Ensure project belongs to user
    const projectRes = await pool.query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
    if (projectRes.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const project = projectRes.rows[0];

    if (status === 'playing') {
      // Pause other playing projects for user
      const playingOthers = await pool.query('SELECT * FROM projects WHERE user_id = $1 AND status = $2 AND id != $3', [userId, 'playing', id]);
      for (const p of playingOthers.rows) {
        // compute elapsed for each
        let elapsed = p.elapsed_seconds || 0;
        if (p.started_at) elapsed += Math.floor((Date.now() - new Date(p.started_at).getTime()) / 1000);
        await pool.query('UPDATE projects SET status = $1, started_at = NULL, elapsed_seconds = $2 WHERE id = $3', ['paused', elapsed, p.id]);
      }

      // Set this project to playing
      await pool.query('UPDATE projects SET status = $1, started_at = $2, auto_paused = FALSE WHERE id = $3', ['playing', new Date(), id]);
    } else if (status === 'paused') {
      // Update elapsed_seconds and clear started_at
      let elapsed = project.elapsed_seconds || 0;
      if (project.started_at) elapsed += Math.floor((Date.now() - new Date(project.started_at).getTime()) / 1000);
      await pool.query('UPDATE projects SET status = $1, started_at = NULL, elapsed_seconds = $2 WHERE id = $3', ['paused', elapsed, id]);
    } else if (status === 'ended') {
      // Mark ended; finalize elapsed seconds
      let elapsed = project.elapsed_seconds || 0;
      if (project.started_at) elapsed += Math.floor((Date.now() - new Date(project.started_at).getTime()) / 1000);
      await pool.query('UPDATE projects SET status = $1, started_at = NULL, elapsed_seconds = $2 WHERE id = $3', ['ended', elapsed, id]);
    }
    const updated = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error updating project status:', error);
    res.status(500).json({ error: 'Failed to update project status' });
  }
});

// Get single project with waypoints
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const project = await pool.query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
    if (project.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const waypoints = await pool.query('SELECT * FROM waypoints WHERE project_id = $1 ORDER BY created_at', [id]);
    res.json({ project: project.rows[0], waypoints: waypoints.rows });
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

export default router;
