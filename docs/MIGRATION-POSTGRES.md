# SQLite → PostgreSQL Migration Guide

**Status:** Documentation only — implement when multi-tenancy is needed.

## When to Migrate

Migrate when any of these conditions are met:
- Multi-tenant isolation required (separate schemas per customer)
- Write concurrency exceeds SQLite's single-writer model
- Dataset exceeds ~100GB
- Need for `LISTEN/NOTIFY` or logical replication

## Step 1: Install Dependencies

```bash
npm install pg knex
# or drizzle-orm + drizzle-kit for type-safe migrations
```

## Step 2: Create PostgreSQL Schema

Convert `db/schema.sql` to Knex/Drizzle migrations:

```bash
npx knex migrate:make initial_schema
```

Key changes:
- `TEXT PRIMARY KEY` → `UUID DEFAULT gen_random_uuid()`
- `BOOLEAN DEFAULT 0` → `BOOLEAN DEFAULT false`
- `CURRENT_TIMESTAMP` → `NOW()`
- `JSON` fields stay `TEXT` or use `JSONB` for indexing
- Add connection pool: `min: 2, max: 10`

## Step 3: Update Repository Layer

The repository pattern is already in place. Each repo uses `this.db.prepare().run()` (better-sqlite3 API).

Replace with Knex/Drizzle queries:

```js
// Before (SQLite)
this.db.prepare('SELECT * FROM campaigns WHERE platform = ?').all(platform);

// After (Knex)
this.db('campaigns').where({ platform }).select('*');

// After (Drizzle)
db.select().from(campaigns).where(eq(campaigns.platform, platform));
```

## Step 4: Docker Compose

Add PostgreSQL service:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: adforge
      POSTGRES_USER: adforge
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U adforge"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

## Step 5: Data Migration Script

```bash
# Export SQLite data
sqlite3 db/adforge.db ".dump" > dump.sql

# Convert SQLite syntax to PostgreSQL
# - Remove AUTOINCREMENT
# - Replace INTEGER with BIGINT for IDs
# - Fix boolean literals (0/1 → false/true)
# - Fix date functions

# Import
psql -U adforge -d adforge -f dump.sql
```

## Step 6: Testing

1. Run full test suite against PostgreSQL
2. Verify foreign key cascading deletes
3. Load test with concurrent writes
4. Verify backup/restore procedure

## Rollback

Keep SQLite as fallback. The repository pattern allows switching back by changing the database driver instantiation in `db/index.js`.
