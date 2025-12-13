import pool from '../database/connection.js';
import { startAutoPauseJob } from '../jobs/autoPauseProjects.js';

async function createExpiredProject(userId = 1) {
  const startedAt = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7 hours ago
  const res = await pool.query(
    'INSERT INTO projects (name, user_id, status, started_at, last_activity) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    ['Test Expired', userId, 'playing', startedAt, startedAt]
  );
  return res.rows[0];
}

async function main() {
  try {
    console.log('Creating expired project...');
    const p = await createExpiredProject();
    console.log('Created project', p.id);
    // Start job with a small interval for test
    const stop = startAutoPauseJob({ intervalMs: 2000, thresholdMs: 6 * 60 * 60 * 1000 });
    // Wait 5 seconds
    await new Promise((r) => setTimeout(r, 5000));
    const updated = await pool.query('SELECT * FROM projects WHERE id = $1', [p.id]);
    console.log('Updated project status:', updated.rows[0].status, 'auto_paused:', updated.rows[0].auto_paused);
    // Cleanup
    await pool.query('DELETE FROM projects WHERE id = $1', [p.id]);
    stop();
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

main();
