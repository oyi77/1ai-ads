<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# smoke

## Purpose
Smoke tests that verify the application starts and basic infrastructure works correctly. Fast-running checks for CI/CD gates.

## Key Files
| File | Description |
|------|-------------|
| `boot.test.js` | Server boot test — verifies app creation, DB initialization, and server start (~3KB) |

## For AI Agents

### Working In This Directory
- Run with `npm run test:smoke`
- These tests should be fast (< 1 second each)
- Verify infrastructure, not business logic
- Good for pre-commit hooks and quick validation

## Dependencies

### Internal
- Tests `server.js` bootstrap and `db/index.js` initialization

<!-- MANUAL: Custom project notes can be added below -->
