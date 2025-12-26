import pool from './connection.js';

async function testConnection() {
    try {
        console.log('Testing database connection...');
        const result = await pool.query('SELECT NOW()');
        console.log('✓ Database connected:', result.rows[0]);

        // Test if email_otps table exists
        const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'email_otps'
      );
    `);
        console.log('email_otps table exists:', tableCheck.rows[0].exists);

        // If not, create it
        if (!tableCheck.rows[0].exists) {
            console.log('Creating email_otps table...');
            await pool.query(`
        CREATE TABLE email_otps (
          email TEXT PRIMARY KEY,
          otp_hash TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL
        );
        CREATE INDEX idx_email_otps_expires_at ON email_otps(expires_at);
      `);
            console.log('✓ email_otps table created');
        }

        // Check if is_verified column exists in users table
        const columnCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_verified'
      );
    `);
        console.log('is_verified column exists:', columnCheck.rows[0].exists);

        // If not, add it
        if (!columnCheck.rows[0].exists) {
            console.log('Adding is_verified column to users table...');
            await pool.query(`
        ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;
      `);
            console.log('✓ is_verified column added');
        }

        console.log('\n✅ OTP setup completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
}

testConnection();
