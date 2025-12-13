import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

// Support for connection string (NeonDB, Heroku, etc.) or individual parameters
let poolConfig;

// Validate DATABASE_URL for placeholder values (warn but don't throw to allow server to start)
if (process.env.DATABASE_URL) {
  const dbUrl = process.env.DATABASE_URL;
  
  // Check for common placeholder patterns
  if (dbUrl.includes('xxx') || dbUrl.includes('your_') || dbUrl.includes('username') || dbUrl.includes('password') || dbUrl.includes('ep-xxx')) {
    console.error('\n❌ WARNING: DATABASE_URL contains placeholder values!');
    console.error('Please update your .env file with your actual database connection string.');
    console.error('Current DATABASE_URL contains placeholder values (xxx, your_, etc.)');
    console.error('Database connections will fail until this is fixed.\n');
    // Don't throw - allow server to start, errors will occur when queries are attempted
  }
  
  // Use connection string (for NeonDB and other cloud providers)
  poolConfig = {
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: false // Required for NeonDB and most cloud databases
    }
  };
} else {
  // Use individual parameters (for local development)
  let sslConfig = false;

  if (process.env.DB_SSL === 'true' || process.env.DB_SSL_MODE === 'require') {
    // SSL required (for cloud databases)
    sslConfig = {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
    };
  } else if (process.env.NODE_ENV === 'production') {
    // Default to SSL in production
    sslConfig = {
      rejectUnauthorized: false
    };
  }

  // Validate individual parameters (warn but don't throw)
  if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
    console.error('\n❌ WARNING: Missing database credentials!');
    console.error('Please set DB_USER and DB_PASSWORD in your .env file, or use DATABASE_URL instead.');
    console.error('Database connections will fail until this is fixed.\n');
    // Don't throw - allow server to start, errors will occur when queries are attempted
  }

  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'navigation_tracking',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: sslConfig,
  };
}

const pool = new Pool(poolConfig);

// Test connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;

