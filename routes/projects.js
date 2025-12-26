import express from 'express';
import pool from '../database/connection.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All project routes require authentication
router.use(authenticateToken);

/**
 * @swagger
 * /api/projects:
 *   get:
 *     tags: [Projects]
 *     summary: Get all projects for authenticated user
 *     description: Retrieve all projects belonging to the authenticated user
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of projects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Project'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to fetch projects
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

/**
 * @swagger
 * /api/projects/active:
 *   get:
 *     tags: [Projects]
 *     summary: Get active project
 *     description: Get the currently active (playing) project with waypoints
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active project with waypoints
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 project:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Project'
 *                     - type: object
 *                       properties:
 *                         waypoints:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Waypoint'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch active project
 */
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

/**
 * @swagger
 * /api/projects:
 *   post:
 *     tags: [Projects]
 *     summary: Create a new project
 *     description: Create a new survey project
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Survey Project 1
 *     responses:
 *       201:
 *         description: Project created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Bad request - name required or duplicate
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to create project
 */
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

/**
 * @swagger
 * /api/projects/{id}/status:
 *   put:
 *     tags: [Projects]
 *     summary: Update project status
 *     description: Change project status (playing/paused/ended)
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [playing, paused, ended]
 *                 example: playing
 *     responses:
 *       200:
 *         description: Project status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Invalid status
 *       404:
 *         description: Project not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to update project status
 */
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

/**
 * @swagger
 * /api/projects/{id}/heartbeat:
 *   post:
 *     tags: [Projects]
 *     summary: Send project heartbeat
 *     description: Update project activity timestamp and checkpoint elapsed time
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Heartbeat recorded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       404:
 *         description: Project not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to record heartbeat
 */
// Heartbeat endpoint: checkpoint elapsed time and touch last_activity while playing
router.post('/:id/heartbeat', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const projectRes = await pool.query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
    if (projectRes.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const project = projectRes.rows[0];

    if (project.status !== 'playing') {
      // just update last_activity
      await pool.query('UPDATE projects SET last_activity = $1 WHERE id = $2', [new Date(), id]);
      const updated = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
      return res.json(updated.rows[0]);
    }

    // If playing, checkpoint elapsed seconds and set started_at to now to begin a fresh segment
    let elapsed = project.elapsed_seconds || 0;
    if (project.started_at) elapsed += Math.floor((Date.now() - new Date(project.started_at).getTime()) / 1000);
    await pool.query('UPDATE projects SET elapsed_seconds = $1, started_at = $2, last_activity = $3 WHERE id = $4', [elapsed, new Date(), new Date(), id]);
    const updated = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error heartbeat project:', error);
    res.status(500).json({ error: 'Failed to heartbeat project' });
  }
});

/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     tags: [Projects]
 *     summary: Get single project
 *     description: Get project details with all waypoints
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project details with waypoints
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 project:
 *                   $ref: '#/components/schemas/Project'
 *                 waypoints:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Waypoint'
 *       404:
 *         description: Project not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to get project
 */
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

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     tags: [Projects]
 *     summary: Delete project
 *     description: Delete project and all associated waypoints
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Project and all waypoints deleted successfully
 *                 project:
 *                   $ref: '#/components/schemas/Project'
 *       404:
 *         description: Project not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to delete project
 */
// Delete project and all its waypoints
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Ensure project belongs to user
    const projectRes = await pool.query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete all waypoints belonging to this project first (foreign key constraint)
    await pool.query('DELETE FROM waypoints WHERE project_id = $1', [id]);

    // Delete the project
    const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING *', [id]);

    res.json({ message: 'Project and all waypoints deleted successfully', project: result.rows[0] });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
