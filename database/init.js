import pool from './connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeDatabase() {
  try {
    console.log('Initializing database...');

    // Read and execute waypoints schema
    const waypointsSchema = fs.readFileSync(
      path.join(__dirname, 'schema.sql'),
      'utf8'
    );
    await pool.query(waypointsSchema);
    console.log('✓ Waypoints table created');

    // Read and execute auth schema
    const authSchema = fs.readFileSync(
      path.join(__dirname, 'auth_schema.sql'),
      'utf8'
    );
    await pool.query(authSchema);
    console.log('✓ Users table created');

    // Run SQL migrations placed under database/migrations
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        if (migrationSql && migrationSql.trim()) {
          await pool.query(migrationSql);
          console.log(`✓ Applied migration: ${file}`);
        }
      }
    }

    console.log('\n✅ Database initialization completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    if (error.code === '42P07') {
      console.log('ℹ️  Tables already exist. This is okay.');
      process.exit(0);
    } else {
      console.error('Full error:', error);
      process.exit(1);
    }
  }
}

initializeDatabase();

