# GPS Path Tracking Implementation - Setup Instructions (PostGIS)

## Overview
This feature provides high-performance real-time GPS path tracking using **PostGIS** spatial geography types. It was upgraded on 2025-12-18 to replace the previous JSONB-based tracking.

## Database Setup

### Step 1: Enable PostGIS & Run Migration
You must have the PostGIS extension installed on your PostgreSQL server.

**Option A: Using psql command line**
```bash
# Navigate to project root
# Run the 2025-12-18 migration
psql -U your_username -d your_database -f server/database/migrations/2025-12-18-postgis-gps-tracking.sql
```

**Option B: Manual Execution**
1. Open your DB client (pgAdmin, DBeaver, etc.)
2. Run `CREATE EXTENSION IF NOT EXISTS postgis;`
3. Execute the full contents of `server/database/migrations/2025-12-18-postgis-gps-tracking.sql`.

### Step 2: Verify the Tables
Verify that the spatial schema is active:

```sql
-- This should show the 'location' column with type 'geography'
\d track_points

-- This should show recording summary metadata
\d tracks_summary
```

## Backend Configuration

### REST API Endpoints
The backend provides the following optimized endpoints in `/api/tracks`:

- `POST /start`: Initializes a `tracks_summary` record.
- `POST /points/batch`: Receives a list of points (lat, lng, accuracy) and inserts them into `track_points`.
- `PUT /end`: Marks the track as inactive and calculates the final `total_distance`.

## Frontend Integration

### The GPSTracker Utility
The system use a dedicated `GPSTracker` class (`src/utils/gpsTracker.js`) which handles:
1. **Filtering**: Ignores points with accuracy > 50m.
2. **Throttling**: Saves points only if 5m moved or 5s passed.
3. **Buffering**: Collects 5 points before sending a batch to the server.
4. **Visualization**: Manages a Leaflet Polyline with a green dotted style.

### Real-Time Usage in MapApp
In `MapApp.jsx`, the tracker is initialized when a survey starts:

```javascript
// Start
gpsTrackerRef.current = new GPSTracker(map, projectId);
await gpsTrackerRef.current.start();

// Feed positions from watchPosition
gpsTrackerRef.current.processPosition(lat, lng, accuracy);
```

## Data Visualization
- **Active Path**: Shared green dotted line on the map.
- **Historic Tracks**: Loaded via `GPSTracker.loadTrack(map, projectId)` as solid blue lines.
