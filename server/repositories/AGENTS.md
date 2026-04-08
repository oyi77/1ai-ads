<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# repositories

## Purpose
Data access layer — direct SQLite queries via better-sqlite3. Each repository manages a single database table and provides CRUD operations. Receives the `db` instance via dependency injection.

## Key Files
| File | Description |
|------|-------------|
| `ads.js` | Ad CRUD — create, list (with filters), update status, delete |
| `campaigns.js` | Campaign CRUD — sync from platforms, update metrics, list with performance |
| `landing.js` | Landing page CRUD — create, update HTML, publish, delete |
| `settings.js` | Key-value settings store — get/set/delete with JSON value support (~4KB) |
| `automation-rules.js` | Automation rule CRUD — create rules, evaluate conditions, toggle active |
| `refresh-tokens.js` | JWT refresh token management — store, validate, revoke |
| `users.js` | User account CRUD — create with bcrypt hash, find by username/email |

## For AI Agents

### Working In This Directory
- All repositories receive `db` (better-sqlite3 instance) as first parameter
- SQL queries use parameterized statements (prevents SQL injection)
- JSON fields (arrays, objects) are stringified on write, parsed on read
- UUIDs generated at application level, not in SQL
- No ORM — raw SQL via `db.prepare()` with `.run()`, `.get()`, `.all()`

### Testing Requirements
- Unit tests in `tests/unit/repositories/` — use in-memory SQLite DB
- Test files: `ads.test.js`, `campaigns.test.js`, `landing.test.js`, `users.test.js`

### Common Patterns
```js
export function createAdsRepository(db) {
  return {
    findAll: (filters) => db.prepare('SELECT * FROM ads WHERE ...').all(filters),
    findById: (id) => db.prepare('SELECT * FROM ads WHERE id = ?').get(id),
    create: (data) => db.prepare('INSERT INTO ads ...').run(data),
    update: (id, data) => db.prepare('UPDATE ads SET ... WHERE id = ?').run(data, id),
    remove: (id) => db.prepare('DELETE FROM ads WHERE id = ?').run(id)
  };
}
```

## Dependencies

### Internal
- `db/` — Database connection and schema

### External
- better-sqlite3 — Synchronous SQLite driver
- uuid — ID generation
- bcryptjs — Password hashing (users repo only)

<!-- MANUAL: Custom project notes can be added below -->
