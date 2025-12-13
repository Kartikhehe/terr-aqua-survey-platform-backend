-- Create database (run this manually in PostgreSQL)
-- CREATE DATABASE navigation_tracking;

-- Create waypoints table
CREATE TABLE IF NOT EXISTS waypoints (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    notes TEXT,
    image_url TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects table: groups of waypoints
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'paused',
    started_at TIMESTAMP NULL,
    elapsed_seconds INTEGER DEFAULT 0,
    last_activity TIMESTAMP NULL,
    auto_paused BOOLEAN DEFAULT FALSE
);

-- Add project_id and project_name to waypoints (if not already present)
ALTER TABLE waypoints ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE waypoints ADD COLUMN IF NOT EXISTS project_name VARCHAR(255);

-- Create index on coordinates for faster queries
CREATE INDEX IF NOT EXISTS idx_waypoints_coordinates ON waypoints(latitude, longitude);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_waypoints_created_at ON waypoints(created_at DESC);

-- Create index on user_id for per-user filtering
CREATE INDEX IF NOT EXISTS idx_waypoints_user_id ON waypoints(user_id);
CREATE INDEX IF NOT EXISTS idx_waypoints_project_id ON waypoints(project_id);

-- Insert default location (required for the app to work properly)
-- This location is used when GPS is unavailable
INSERT INTO waypoints (name, latitude, longitude, notes)
VALUES ('Default Location', 26.516654, 80.231507, 'Default location when GPS is unavailable')
ON CONFLICT DO NOTHING;

-- Backfill existing waypoints to system user (optional helper)
-- UPDATE waypoints SET user_id = NULL WHERE user_id IS NULL;

