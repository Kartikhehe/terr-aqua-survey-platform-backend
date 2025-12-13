import pool from '../database/connection.js';

// Auto-pause player projects that have been inactive for > thresholdMs
export function startAutoPauseJob({ intervalMs = 15 * 60 * 1000, thresholdMs = 6 * 60 * 60 * 1000 } = {}) {
  console.log(`Auto-pause job started (interval ${intervalMs}ms, threshold ${thresholdMs}ms)`);

  const doWork = async () => {
    try {
      const thresholdDate = new Date(Date.now() - thresholdMs);
      // Find playing projects with last_activity before threshold OR null with started_at before threshold
      const res = await pool.query(
        `SELECT * FROM projects WHERE status = $1 AND (last_activity IS NULL OR last_activity < $2) AND started_at IS NOT NULL`,
        ['playing', thresholdDate]
      );
      if (res.rows.length === 0) return;
      for (const p of res.rows) {
        // Compute elapsed seconds
        let elapsed = p.elapsed_seconds || 0;
        if (p.started_at) elapsed += Math.floor((Date.now() - new Date(p.started_at).getTime()) / 1000);
        await pool.query('UPDATE projects SET status = $1, started_at = NULL, elapsed_seconds = $2, auto_paused = TRUE WHERE id = $3', ['paused', elapsed, p.id]);
        console.log(`Auto-paused project ${p.id} (user ${p.user_id})`);
      }
    } catch (err) {
      console.error('Error running auto-pause job:', err?.message || err);
    }
  };

  // Run immediately and then periodically
  doWork();
  const timer = setInterval(doWork, intervalMs);
  return () => clearInterval(timer);
}
