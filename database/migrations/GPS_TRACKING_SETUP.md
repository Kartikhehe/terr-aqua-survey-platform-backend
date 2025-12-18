# GPS Path Tracking Implementation - Setup Instructions

## Overview
This feature adds real-time GPS path tracking for survey projects, storing tracks in GPX-compatible format.

## Database Setup

### Step 1: Run the Migration

You need to run the SQL migration to create the `tracks` table in your existing database.

**Option A: Using psql command line**
```bash
# Navigate to server directory
cd server

# Run the migration (replace with your actual database credentials)
psql -U your_username -d your_database_name -f database/migrations/2025-12-17-add-tracks-table.sql
```

**Option B: Using pgAdmin or Database GUI**
1. Open pgAdmin or your preferred PostgreSQL GUI
2. Connect to your database
3. Open the SQL query tool
4. Copy and paste the contents of `server/database/migrations/2025-12-17-add-tracks-table.sql`
5. Execute the query

**Option C: Using Node.js script (if you have a migration runner)**
```javascript
// If you have a migration runner, add the migration file to your migrations folder
// and run your migration command
npm run migrate
```

### Step 2: Verify the Migration

After running the migration, verify that the `tracks` table was created:

```sql
-- Check if table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'tracks';

-- View table structure
\d tracks
```

You should see:
- `id` (SERIAL PRIMARY KEY)
- `project_id` (INTEGER, references projects)
- `user_id` (INTEGER, references users)
- `track_points` (JSONB array)
- `started_at`, `ended_at` (TIMESTAMP)
- `total_distance` (DECIMAL)
- `total_duration` (INTEGER)
- `is_active` (BOOLEAN)
- `created_at`, `updated_at` (TIMESTAMP)

## Backend Setup

### Step 3: Restart the Server

The backend routes have been added automatically. Just restart your server:

```bash
# Stop the current server (Ctrl+C)
# Then restart
cd server
npm run dev
```

### Step 4: Test the API

Test that the tracks API is working:

```bash
# Health check
curl http://localhost:3001/api/health

# Test tracks endpoint (requires authentication)
curl -X POST http://localhost:3001/api/tracks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"project_id": 1}'
```

## Frontend Setup

### Step 5: Add Frontend API Methods

The tracks API methods have been added to `src/services/api.js`. You can now use:

```javascript
import { tracksAPI } from '../services/api';

// Create a new track
const track = await tracksAPI.create(projectId);

// Add a point to the track
await tracksAPI.addPoint(trackId, {
  lat: 26.5167,
  lng: 80.2315,
  accuracy: 10,
  elevation: 100,
  timestamp: new Date().toISOString()
});

// End the track
await tracksAPI.endTrack(trackId);

// Get all tracks for a project
const tracks = await tracksAPI.getByProject(projectId);

// Export track as GPX
const gpxData = await tracksAPI.exportGPX(trackId);
```

## How It Works

1. **Start Survey**: When a project starts recording, a new track is created
2. **Record Points**: GPS coordinates are recorded every 5-10 seconds while recording
3. **Draw Path**: A dotted line is drawn on the map in real-time
4. **Pause/Resume**: Track recording pauses when project is paused
5. **End Survey**: Track is finalized when project ends
6. **View Tracks**: Saved tracks can be loaded and displayed on the map
7. **Export GPX**: Tracks can be exported in standard GPX format

## Data Format

### Track Points (JSONB)
```json
[
  {
    "lat": 26.5167,
    "lng": 80.2315,
    "accuracy": 10,
    "elevation": 100,
    "timestamp": "2025-12-17T12:30:00.000Z"
  }
]
```

### GPX Export Format
```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TerrAqua Survey Platform">
  <metadata>
    <name>Project Name Track</name>
    <time>2025-12-17T12:00:00.000Z</time>
  </metadata>
  <trk>
    <name>Project Name</name>
    <trkseg>
      <trkpt lat="26.5167" lon="80.2315">
        <ele>100</ele>
        <time>2025-12-17T12:30:00.000Z</time>
        <hdop>10</hdop>
      </trkpt>
    </trkseg>
  </trk>
</gpx>
```

## Next Steps

After completing the database setup, you can implement the frontend tracking logic in `MapApp.jsx`:

1. Start tracking when `handleStartRecording()` is called
2. Record GPS points using `setInterval()` every 5-10 seconds
3. Draw polyline on map using Leaflet
4. Pause tracking when `handlePauseRecording()` is called
5. End tracking when project ends

Would you like me to implement the frontend tracking logic next?
