<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# functional

## Purpose
Functional validation tests that verify end-to-end feature behavior from input to output, crossing multiple layers.

## Key Files
| File | Description |
|------|-------------|
| `validation.test.js` | Input validation rules — tests validate middleware across various request payloads and edge cases (~4KB) |

## For AI Agents

### Working In This Directory
- Run with `npm run test:functional`
- Tests cross-cutting concerns (validation) that span multiple routes
- Validates request schemas, edge cases, and error responses

### Common Patterns
- Test invalid inputs and verify proper error responses
- Test boundary conditions (empty strings, missing fields, wrong types)

## Dependencies

### Internal
- Tests validation middleware from `server/routes/validate.js`

<!-- MANUAL: Custom project notes can be added below -->
