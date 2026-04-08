<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# unit

## Purpose
Vitest unit tests organized to mirror the server directory structure. Each subdirectory tests the corresponding server module in isolation with mocked dependencies.

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `db/` | Database connection and schema tests (`index.test.js`) |
| `lib/` | Utility library tests — auth, escape, validate, templates, generators |
| `services/` | Service layer tests — ad-generator, AI, landing-generator, LLM client, templates |
| `repositories/` | Repository tests — ads, campaigns, landing, users (use in-memory SQLite) |
| `middleware/` | Middleware tests — auth middleware |
| `routes/` | Route handler tests (currently empty) |

## For AI Agents

### Working In This Directory
- Run targeted: `npm run test:unit` or `npx vitest run tests/unit/`
- Each test file matches its server counterpart: `server/lib/auth.js` → `unit/lib/auth.test.js`
- Repository tests use in-memory SQLite via `tests/helpers/db.js`
- Service tests mock repositories and external APIs
- Lib tests mock only external dependencies

### Testing Requirements
- New server modules must have corresponding unit tests
- Use `vi.mock()` for dependency mocking
- Use `vi.fn()` for function spies
- Keep tests focused — one describe block per function/method

### Common Patterns
- `vi.mock('../../server/repositories/ads.js')` for repository mocking
- `createDatabase(':memory:')` for test DB isolation
- Test structure: `describe()` → `it()`/`test()` → `expect()`

## Dependencies

### Internal
- Tests import from `server/` and `db/`
- Uses `tests/helpers/` for shared fixtures and DB setup

### External
- Vitest 4 — Test runner with built-in mocking

<!-- MANUAL: Custom project notes can be added below -->
