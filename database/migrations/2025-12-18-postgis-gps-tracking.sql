-- Migration: Upgrade to PostGIS-based GPS tracking
-- Date: 2025-12-18
-- Description: Replaces JSONB track storage with PostGIS geography points for better performance

-- Enable PostGIS extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Drop old tracks table if it exists
DROP TABLE IF EXISTS tracks CASCADE;

-- Create new track_points table with PostGIS
CREATE TABLE IF NOT EXISTS track_points (
    id BIGSERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    accuracy DECIMAL(10, 2), -- GPS accuracy in meters
    elevation DECIMAL(10, 2), -- Elevation in meters (optional)
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create spatial index for location queries (GIST index)
CREATE INDEX IF NOT EXISTS idx_track_location 
ON track_points USING GIST (location);

-- Create index for project and time-based queries
CREATE INDEX IF NOT EXISTS idx_track_project_time 
ON track_points (project_id, recorded_at);

-- Create index for user queries
CREATE INDEX IF NOT EXISTS idx_track_user 
ON track_points (user_id);

-- Create composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_track_project_user 
ON track_points (project_id, user_id, recorded_at);

-- Create tracks_summary table for metadata
CREATE TABLE IF NOT EXISTS tracks_summary (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ,
    total_distance DECIMAL(10, 2) DEFAULT 0, -- in meters
    total_duration INTEGER DEFAULT 0, -- in seconds
    point_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id, started_at)
);

-- Create indexes for tracks_summary
CREATE INDEX IF NOT EXISTS idx_tracks_summary_project 
ON tracks_summary (project_id);

CREATE INDEX IF NOT EXISTS idx_tracks_summary_active 
ON tracks_summary (is_active) WHERE is_active = true;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tracks_summary_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tracks_summary_updated_at_trigger
    BEFORE UPDATE ON tracks_summary
    FOR EACH ROW
    EXECUTE FUNCTION update_tracks_summary_updated_at();

-- Function to calculate total distance for a track
CREATE OR REPLACE FUNCTION calculate_track_distance(p_project_id INTEGER, p_user_id INTEGER)
RETURNS DECIMAL AS $$
DECLARE
    total_dist DECIMAL := 0;
BEGIN
    SELECT COALESCE(
        SUM(
            ST_Distance(
                location,
                LAG(location) OVER (ORDER BY recorded_at)
            )
        ), 0
    ) INTO total_dist
    FROM track_points
    WHERE project_id = p_project_id 
    AND user_id = p_user_id
    AND recorded_at >= (
        SELECT started_at 
        FROM tracks_summary 
        WHERE project_id = p_project_id 
        AND user_id = p_user_id 
        AND is_active = true 
        LIMIT 1
    );
    
    RETURN total_dist;
END;
$$ LANGUAGE plpgsql;

-- Function to get track as LineString
CREATE OR REPLACE FUNCTION get_track_linestring(p_project_id INTEGER, p_user_id INTEGER)
RETURNS GEOGRAPHY AS $$
BEGIN
    RETURN (
        SELECT ST_MakeLine(location::geometry ORDER BY recorded_at)::geography
        FROM track_points
        WHERE project_id = p_project_id 
        AND user_id = p_user_id
        ORDER BY recorded_at
    );
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE track_points IS 'Stores individual GPS points using PostGIS geography type';
COMMENT ON COLUMN track_points.location IS 'PostGIS geography point (WGS84, SRID 4326)';
COMMENT ON COLUMN track_points.accuracy IS 'GPS accuracy in meters';
COMMENT ON TABLE tracks_summary IS 'Metadata and statistics for GPS tracks';
COMMENT ON FUNCTION calculate_track_distance IS 'Calculates total distance traveled using PostGIS ST_Distance';
COMMENT ON FUNCTION get_track_linestring IS 'Returns track as a PostGIS LineString for visualization';
