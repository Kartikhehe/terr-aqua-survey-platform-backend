-- Migration: Add tracks table for GPS path recording
-- Date: 2025-12-17
-- Description: Creates tracks table to store GPS paths for projects in GPX-compatible format

-- Create tracks table
CREATE TABLE IF NOT EXISTS tracks (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_points JSONB NOT NULL DEFAULT '[]', -- Array of {lat, lng, timestamp, accuracy, elevation}
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    total_distance DECIMAL(10, 2) DEFAULT 0, -- in meters
    total_duration INTEGER DEFAULT 0, -- in seconds
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_tracks_project_id ON tracks(project_id);
CREATE INDEX IF NOT EXISTS idx_tracks_user_id ON tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_is_active ON tracks(is_active);
CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON tracks(created_at DESC);

-- Add trigger to update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_tracks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tracks_updated_at_trigger
    BEFORE UPDATE ON tracks
    FOR EACH ROW
    EXECUTE FUNCTION update_tracks_updated_at();

-- Add comment to table
COMMENT ON TABLE tracks IS 'Stores GPS track data for survey projects in GPX-compatible format';
COMMENT ON COLUMN tracks.track_points IS 'JSONB array of GPS points with lat, lng, timestamp, accuracy, and elevation';
COMMENT ON COLUMN tracks.total_distance IS 'Total distance traveled in meters';
COMMENT ON COLUMN tracks.is_active IS 'Whether the track is currently being recorded';
