-- Migration: Add support for multiple images per waypoint
-- Date: 2025-12-20
-- Description: Changes image_url from TEXT to JSONB array to support multiple images

-- Step 1: Add new column for multiple images
ALTER TABLE waypoints ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- Step 2: Migrate existing single image_url to images array
UPDATE waypoints 
SET images = jsonb_build_array(
    jsonb_build_object(
        'url', image_url,
        'public_id', NULL,
        'uploaded_at', created_at
    )
)
WHERE image_url IS NOT NULL AND image_url != '';

-- Step 3: For waypoints without images, ensure empty array
UPDATE waypoints 
SET images = '[]'::jsonb
WHERE image_url IS NULL OR image_url = '';

-- Step 4: Drop the old image_url column (OPTIONAL - uncomment if you want to remove it)
-- ALTER TABLE waypoints DROP COLUMN IF EXISTS image_url;

-- Step 5: Add index on images for faster queries
CREATE INDEX IF NOT EXISTS idx_waypoints_images ON waypoints USING GIN (images);

-- Verify migration
-- SELECT id, name, image_url, images FROM waypoints LIMIT 10;
