<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# design

## Purpose
Design tokens for Adforge — centralized color palette and CSS custom properties used throughout the frontend. Ensures visual consistency across all views.

## Key Files
| File | Description |
|------|-------------|
| `colors.js` | JavaScript export of color names and hex values |
| `tokens.css` | CSS custom properties (`--color-primary`, `--spacing-base`, etc.) declared in `:root` |

## For AI Agents

### Working In This Directory
- Colors defined in `colors.js` as an object literal
- CSS variables declared in `:root` inside `tokens.css`
- Components under `client/src/views/` reference these tokens
- JS usage: `import colors from './colors.js'`
- CSS usage: `background-color: var(--color-primary);`

### Testing Requirements
- No dedicated tests — tokens are consumed, not tested
- Verify by checking component rendering

### Common Patterns
- No hard-coded color values in component style blocks
- All colors must reference `tokens.css` variables or `colors.js` exports
- Avoid duplicate definitions between `colors.js` and `tokens.css`

## Dependencies

### Internal
- Consumed by all `client/src/views/` components

<!-- MANUAL: Custom project notes can be added below -->
