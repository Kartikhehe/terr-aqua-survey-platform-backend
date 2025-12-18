import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import pool from '../database/connection.js';

const router = express.Router();

// Start a new track for a project
router.post('/start', authenticateToken, async (req, res) => {
    try {
        const { project_id } = req.body;
        const user_id = req.user.id;

        // Check if project belongs to user
        const projectCheck = await pool.query(
            'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
            [project_id, user_id]
        );

        if (projectCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Project not found or access denied' });
        }

        // End any existing active tracks for this project
        await pool.query(
            'UPDATE tracks_summary SET is_active = false, ended_at = CURRENT_TIMESTAMP WHERE project_id = $1 AND user_id = $2 AND is_active = true',
            [project_id, user_id]
        );

        // Create new track summary
        const result = await pool.query(
            `INSERT INTO tracks_summary (project_id, user_id, is_active)
             VALUES ($1, $2, true)
             RETURNING *`,
            [project_id, user_id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error starting track:', error);
        res.status(500).json({ error: 'Failed to start track' });
    }
});

// Batch add points to track (optimized)
router.post('/points/batch', authenticateToken, async (req, res) => {
    try {
        const { project_id, points } = req.body;
        const user_id = req.user.id;

        if (!points || !Array.isArray(points) || points.length === 0) {
            return res.status(400).json({ error: 'Points array is required' });
        }

        // Verify active track exists
        const trackCheck = await pool.query(
            'SELECT id FROM tracks_summary WHERE project_id = $1 AND user_id = $2 AND is_active = true',
            [project_id, user_id]
        );

        if (trackCheck.rows.length === 0) {
            return res.status(404).json({ error: 'No active track found for this project' });
        }

        // Build batch insert query using PostGIS ST_MakePoint
        const values = [];
        const placeholders = [];

        points.forEach((point, index) => {
            const baseIndex = index * 6;
            placeholders.push(
                `($${baseIndex + 1}, $${baseIndex + 2}, ST_SetSRID(ST_MakePoint($${baseIndex + 3}, $${baseIndex + 4}), 4326)::geography, $${baseIndex + 5}, $${baseIndex + 6})`
            );
            values.push(
                project_id,
                user_id,
                point.lng, // longitude first for ST_MakePoint
                point.lat, // latitude second
                point.accuracy || null,
                point.elevation || null
            );
        });

        const query = `
            INSERT INTO track_points (project_id, user_id, location, accuracy, elevation, recorded_at)
            VALUES ${placeholders.join(', ')}
            RETURNING id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng, recorded_at
        `;

        const result = await pool.query(query, values);

        // Update point count in summary
        await pool.query(
            'UPDATE tracks_summary SET point_count = point_count + $1 WHERE project_id = $2 AND user_id = $3 AND is_active = true',
            [points.length, project_id, user_id]
        );

        res.json({
            success: true,
            points_saved: result.rows.length,
            points: result.rows
        });
    } catch (error) {
        console.error('Error adding track points:', error);
        res.status(500).json({ error: 'Failed to add track points' });
    }
});

// End track and calculate final statistics
router.put('/end', authenticateToken, async (req, res) => {
    try {
        const { project_id } = req.body;
        const user_id = req.user.id;

        // Calculate total distance using PostGIS
        const distanceResult = await pool.query(
            'SELECT calculate_track_distance($1, $2) as total_distance',
            [project_id, user_id]
        );

        const totalDistance = parseFloat(distanceResult.rows[0]?.total_distance || 0);

        // Get time range
        const timeResult = await pool.query(
            `SELECT 
                MIN(recorded_at) as start_time,
                MAX(recorded_at) as end_time
             FROM track_points
             WHERE project_id = $1 AND user_id = $2`,
            [project_id, user_id]
        );

        const startTime = timeResult.rows[0]?.start_time;
        const endTime = timeResult.rows[0]?.end_time;
        const totalDuration = startTime && endTime
            ? Math.floor((new Date(endTime) - new Date(startTime)) / 1000)
            : 0;

        // Update track summary
        const result = await pool.query(
            `UPDATE tracks_summary 
             SET is_active = false, 
                 ended_at = CURRENT_TIMESTAMP,
                 total_distance = $1,
                 total_duration = $2
             WHERE project_id = $3 AND user_id = $4 AND is_active = true
             RETURNING *`,
            [totalDistance, totalDuration, project_id, user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No active track found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error ending track:', error);
        res.status(500).json({ error: 'Failed to end track' });
    }
});

// Get track points for a project (for visualization)
router.get('/project/:projectId', authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const user_id = req.user.id;

        // Get track points as GeoJSON-compatible format
        const result = await pool.query(
            `SELECT 
                id,
                ST_Y(location::geometry) as lat,
                ST_X(location::geometry) as lng,
                accuracy,
                elevation,
                recorded_at
             FROM track_points
             WHERE project_id = $1 AND user_id = $2
             ORDER BY recorded_at ASC`,
            [projectId, user_id]
        );

        // Get track summary
        const summaryResult = await pool.query(
            'SELECT * FROM tracks_summary WHERE project_id = $1 AND user_id = $2 ORDER BY started_at DESC LIMIT 1',
            [projectId, user_id]
        );

        res.json({
            points: result.rows,
            summary: summaryResult.rows[0] || null,
            total_points: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching track:', error);
        res.status(500).json({ error: 'Failed to fetch track' });
    }
});

// Get active track for a project
router.get('/project/:projectId/active', authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const user_id = req.user.id;

        const result = await pool.query(
            'SELECT * FROM tracks_summary WHERE project_id = $1 AND user_id = $2 AND is_active = true',
            [projectId, user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No active track found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching active track:', error);
        res.status(500).json({ error: 'Failed to fetch active track' });
    }
});

// Export track as GPX
router.get('/:projectId/gpx', authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const user_id = req.user.id;

        // Get track points
        const pointsResult = await pool.query(
            `SELECT 
                ST_Y(location::geometry) as lat,
                ST_X(location::geometry) as lng,
                elevation,
                accuracy,
                recorded_at
             FROM track_points
             WHERE project_id = $1 AND user_id = $2
             ORDER BY recorded_at ASC`,
            [projectId, user_id]
        );

        // Get project name
        const projectResult = await pool.query(
            'SELECT name FROM projects WHERE id = $1',
            [projectId]
        );

        const projectName = projectResult.rows[0]?.name || `Project ${projectId}`;
        const points = pointsResult.rows;

        if (points.length === 0) {
            return res.status(404).json({ error: 'No track points found' });
        }

        // Generate GPX
        const gpx = generateGPX(points, projectName);

        res.setHeader('Content-Type', 'application/gpx+xml');
        res.setHeader('Content-Disposition', `attachment; filename="track_${projectId}.gpx"`);
        res.send(gpx);
    } catch (error) {
        console.error('Error exporting GPX:', error);
        res.status(500).json({ error: 'Failed to export GPX' });
    }
});

// Helper function to generate GPX XML
function generateGPX(points, projectName) {
    const escapeXml = (str) => {
        return String(str).replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case "'": return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        });
    };

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TerrAqua Survey Platform"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(projectName)} Track</name>
    <time>${points[0].recorded_at}</time>
  </metadata>
  <trk>
    <name>${escapeXml(projectName)}</name>
    <trkseg>
`;

    points.forEach(point => {
        gpx += `      <trkpt lat="${point.lat}" lon="${point.lng}">
`;
        if (point.elevation !== null && point.elevation !== undefined) {
            gpx += `        <ele>${point.elevation}</ele>
`;
        }
        gpx += `        <time>${point.recorded_at}</time>
`;
        if (point.accuracy !== null && point.accuracy !== undefined) {
            gpx += `        <hdop>${point.accuracy}</hdop>
`;
        }
        gpx += `      </trkpt>
`;
    });

    gpx += `    </trkseg>
  </trk>
</gpx>`;

    return gpx;
}

export default router;
