# DESIGN AGENTS.md

## OVERVIEW
Design tokens for Adforge – centralised colour palette and CSS variables used throughout the front‑end.

## FILES
- `colors.js` – JavaScript export of colour names and hex values.
- `tokens.css` – CSS custom properties (`--color-primary`, `--spacing-base`, etc.) that reference the colours.

## USAGE
Import the colour map in JS:
```js
import colors from './colors.js';
export const primary = colors.blue;
```
Reference CSS variables in stylesheets or styled components:
```css
.button { background-color: var(--color-primary); }
```
All components under `client/src/components/` should use these tokens for consistency.

## CONVENTIONS
- Colours are defined in `colors.js` as an object literal.
- CSS variables are declared in `:root` inside `tokens.css`.
- No hard‑coded colour values in component files – always reference the token.

## ANTI‑PATTERNS
- Direct hex strings in component style blocks are prohibited.
- Duplicate colour definitions across `colors.js` and `tokens.css` should be avoided.
