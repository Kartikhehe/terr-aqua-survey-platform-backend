import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import pool from '../db.js';

const router = express.Router();

// Start a new track for a project
router.post('/', authenticateToken, async (req, res) => {
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
            'UPDATE tracks SET is_active = false, ended_at = CURRENT_TIMESTAMP WHERE project_id = $1 AND user_id = $2 AND is_active = true',
            [project_id, user_id]
        );

        // Create new track
        const result = await pool.query(
            `INSERT INTO tracks (project_id, user_id, track_points, is_active)
             VALUES ($1, $2, $3, true)
             RETURNING *`,
            [project_id, user_id, JSON.stringify([])]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error creating track:', error);
        res.status(500).json({ error: 'Failed to create track' });
    }
});

// Add point to active track
router.post('/:id/points', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { lat, lng, accuracy, elevation, timestamp } = req.body;
        const user_id = req.user.id;

        // Get current track
        const track = await pool.query(
            'SELECT * FROM tracks WHERE id = $1 AND user_id = $2 AND is_active = true',
            [id, user_id]
        );

        if (track.rows.length === 0) {
            return res.status(404).json({ error: 'Active track not found' });
        }

        // Add new point
        const trackPoints = track.rows[0].track_points || [];
        const newPoint = {
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            accuracy: accuracy || null,
            elevation: elevation || null,
            timestamp: timestamp || new Date().toISOString()
        };
        trackPoints.push(newPoint);

        // Calculate distance if there are previous points
        let totalDistance = parseFloat(track.rows[0].total_distance) || 0;
        if (trackPoints.length > 1) {
            const prevPoint = trackPoints[trackPoints.length - 2];
            const distance = calculateDistance(
                prevPoint.lat, prevPoint.lng,
                newPoint.lat, newPoint.lng
            );
            totalDistance += distance;
        }

        // Update track
        const result = await pool.query(
            `UPDATE tracks 
             SET track_points = $1, total_distance = $2
             WHERE id = $3 AND user_id = $4
             RETURNING *`,
            [JSON.stringify(trackPoints), totalDistance, id, user_id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error adding track point:', error);
        res.status(500).json({ error: 'Failed to add track point' });
    }
});

// Pause/End track
router.put('/:id/end', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        const result = await pool.query(
            `UPDATE tracks 
             SET is_active = false, ended_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [id, user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Track not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error ending track:', error);
        res.status(500).json({ error: 'Failed to end track' });
    }
});

// Get active track for a project
router.get('/project/:projectId/active', authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const user_id = req.user.id;

        const result = await pool.query(
            'SELECT * FROM tracks WHERE project_id = $1 AND user_id = $2 AND is_active = true ORDER BY created_at DESC LIMIT 1',
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

// Get all tracks for a project
router.get('/project/:projectId', authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const user_id = req.user.id;

        const result = await pool.query(
            'SELECT * FROM tracks WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC',
            [projectId, user_id]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching tracks:', error);
        res.status(500).json({ error: 'Failed to fetch tracks' });
    }
});

// Export track as GPX
router.get('/:id/gpx', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        const track = await pool.query(
            `SELECT t.*, p.name as project_name 
             FROM tracks t 
             JOIN projects p ON t.project_id = p.id 
             WHERE t.id = $1 AND t.user_id = $2`,
            [id, user_id]
        );

        if (track.rows.length === 0) {
            return res.status(404).json({ error: 'Track not found' });
        }

        const gpxData = generateGPX(track.rows[0]);

        res.setHeader('Content-Type', 'application/gpx+xml');
        res.setHeader('Content-Disposition', `attachment; filename="track_${id}.gpx"`);
        res.send(gpxData);
    } catch (error) {
        console.error('Error exporting GPX:', error);
        res.status(500).json({ error: 'Failed to export GPX' });
    }
});

// Helper function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

// Helper function to generate GPX XML
function generateGPX(track) {
    const points = track.track_points || [];
    const projectName = track.project_name || `Project ${track.project_id}`;

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TerrAqua Survey Platform"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(projectName)} Track</name>
    <time>${track.created_at}</time>
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
        gpx += `        <time>${point.timestamp}</time>
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

// Helper function to escape XML special characters
function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

export default router;
