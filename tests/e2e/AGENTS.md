<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# e2e

## Purpose
End-to-end browser tests using Playwright. These tests start the full server, open a real browser, and verify complete user workflows across the Adforge UI.

## Key Files
| File | Description |
|------|-------------|
| `full-app.spec.js` | Comprehensive app test suite — navigation, all views, data flow (~14KB) |
| `competitor-spy.spec.js` | Competitor monitoring feature E2E test |
| `fix-verification.spec.js` | Regression verification — confirms specific bug fixes |

## For AI Agents

### Working In This Directory
- Run with `npm run test:e2e`
- Playwright config in root `playwright.config.js`
- Tests require a running server (Playwright handles this via `webServer` config)
- Uses `@playwright/test` framework
- Specs target `http://localhost:3000` by default

### Testing Requirements
- All new user-facing features should have a corresponding E2E spec
- Use `test.describe()` for grouping, `test()` for individual cases
- Page objects or selectors should match `data-testid` attributes when available

### Common Patterns
- `page.goto('/')` for navigation
- `page.locator()` for element selection
- `expect(locator).toBeVisible()` for assertions

## Dependencies

### Internal
- Requires full server stack running
- Tests exercise `client/src/views/` through the browser

### External
- @playwright/test — Browser automation framework

<!-- MANUAL: Custom project notes can be added below -->
