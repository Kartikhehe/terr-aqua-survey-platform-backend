-- Simpler migration for OTP support
-- Create email_otps table
CREATE TABLE IF NOT EXISTS email_otps (
  email TEXT PRIMARY KEY,
  otp_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_email_otps_expires_at ON email_otps(expires_at);
