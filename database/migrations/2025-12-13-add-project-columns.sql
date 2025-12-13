-- Add project timing and status columns (idempotent)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'paused';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS started_at TIMESTAMP NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS elapsed_seconds INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS auto_paused BOOLEAN DEFAULT FALSE;

-- Ensure waypoints reference new project fields
ALTER TABLE waypoints ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE waypoints ADD COLUMN IF NOT EXISTS project_name VARCHAR(255);
