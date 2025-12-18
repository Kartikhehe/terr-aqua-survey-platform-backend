import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : false
});

async function runMigration() {
    const client = await pool.connect();

    try {
        console.log('🔄 Starting PostGIS GPS Tracking Migration...\n');

        // Read migration file
        const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '2025-12-18-postgis-gps-tracking.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

        console.log('📝 Migration file loaded');
        console.log('🗄️  Executing migration...\n');

        // Execute migration
        await client.query(migrationSQL);

        console.log('✅ Migration completed successfully!\n');

        // Verify tables were created
        const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('track_points', 'tracks_summary')
      ORDER BY table_name
    `);

        console.log('📊 Tables created:');
        tableCheck.rows.forEach(row => {
            console.log(`   ✓ ${row.table_name}`);
        });

        // Check PostGIS extension
        const postgisCheck = await client.query(`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname = 'postgis'
    `);

        if (postgisCheck.rows.length > 0) {
            console.log(`\n✅ PostGIS version: ${postgisCheck.rows[0].extversion}`);
        } else {
            console.log('\n⚠️  PostGIS extension not found');
        }

        console.log('\n🎉 Database is ready for GPS tracking!');

    } catch (error) {
        console.error('❌ Migration failed:');
        console.error(error.message);
        console.error('\nDetails:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
