# Database Migrations

This folder contains simple SQL migrations used to incrementally modify the database schema.

How it works:
- `database/init.js` runs `schema.sql` and `auth_schema.sql`, then looks for `.sql` files in `database/migrations/` and executes them in lexicographic order.
- Each migration should be idempotent (use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and similar commands).

Running migrations locally:

1. Ensure your `.env` file is configured with `DATABASE_URL`.
2. Run:

```
cd server
npm run init-db
```

Notes:
- The migration runner is intentionally simple and suitable for lightweight deployments. If you need robust schema versioning, consider adding a proper migrator like `node-pg-migrate` or `knex`.
- The `2025-12-13-add-project-columns.sql` adds project timing fields and ensures `waypoints` have `project_id` and `project_name`.
