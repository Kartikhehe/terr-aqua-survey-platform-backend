-- Migration: Add track_id to track_points to support multi-segment paths
-- Date: 2025-12-18

-- 1. Add track_id column to track_points
-- It references tracks_summary(id)
ALTER TABLE track_points 
ADD COLUMN IF NOT EXISTS track_id INTEGER REFERENCES tracks_summary(id) ON DELETE CASCADE;

-- 2. Create index for faster grouping by track_id
CREATE INDEX IF NOT EXISTS idx_track_points_track_id ON track_points(track_id);

-- 3. Update calculate_track_distance to use track_id for more precise calculation
-- This version calculates the distance for a SPECIFIC track segment
CREATE OR REPLACE FUNCTION calculate_segment_distance(p_track_id INTEGER)
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
    WHERE track_id = p_track_id;
    
    RETURN total_dist;
END;
$$ LANGUAGE plpgsql;

-- 4. Keep calculate_track_distance for project-wide summary if needed, but updated to use segments correctly
CREATE OR REPLACE FUNCTION calculate_project_total_distance(p_project_id INTEGER, p_user_id INTEGER)
RETURNS DECIMAL AS $$
DECLARE
    total_dist DECIMAL := 0;
BEGIN
    -- Sum of distances within each segment to avoid jumps between segments
    SELECT COALESCE(SUM(segment_dist), 0) INTO total_dist
    FROM (
        SELECT track_id, calculate_segment_distance(track_id) as segment_dist
        FROM track_points
        WHERE project_id = p_project_id 
        AND user_id = p_user_id
        GROUP BY track_id
    ) segments;
    
    RETURN total_dist;
END;
$$ LANGUAGE plpgsql;
