# AdForge Autopilot Spec - Fix Critical User Feedback

## Problem Statement
User reports: "Currently it seems nothing is working"
- No auth - dashboard shows directly without login
- Design broken on mobile
- Features appear mock-only
- No real testing from the website perspective

## Requirements

### R1: Authentication & Landing Page
- Public landing page at `/` describing AdForge
- Login page at `#/login` with username/password
- JWT-based session (stored in localStorage)
- Protected routes redirect to login if no token
- Users table in SQLite (id, username, password_hash, created_at)
- Default admin user seeded on first run
- Logout button in nav
- bcrypt for password hashing

### R2: Responsive Mobile Design
- Hamburger menu on mobile (< 768px)
- All grids collapse to single column on mobile
- Landing page template `grid-cols-3` -> responsive
- Forms full-width on mobile
- Nav links hidden behind hamburger on small screens
- Touch-friendly button sizes (min 44px tap target)

### R3: Working Features (Not Mock)
- Ads generation: verify OmniRoute is reachable, show clear error if not
- Landing page creation: template rendering works (confirmed)
- Landing page AI generation: wire the /generate endpoint into UI
- Analytics: seed demo campaign data so dashboard isn't all zeros
- MCP: clearly mark as "Coming Soon" in UI, don't pretend it works
- Search: wire search bar into ads list page
- Export: add download button to landing page list

### R4: Comprehensive Test Suite
- **E2E tests** (Playwright): Login flow, create ad, create landing page, view dashboard
- **API tests** (supertest): All endpoints with valid/invalid data
- **Frontend tests** (vitest + jsdom): Router, API client, escape utility
- **Smoke tests**: Server boots, production build works, critical endpoints respond
- **Integration tests**: Full CRUD flows through API with real DB
- **Functional tests**: Business logic (ad generation parsing, template rendering, validation)

## Technical Constraints
- Keep existing stack: Express 5 + Vite + SQLite + Vanilla JS
- Keep existing architecture: app factory, repositories, DI
- Add: bcryptjs (pure JS, no native deps), jsonwebtoken
- Add: @playwright/test for E2E
- OmniRoute at localhost:20128 (or env var)

## Success Criteria
- [ ] Visiting site shows landing page, not dashboard
- [ ] Login required to access dashboard/ads/landing/analytics
- [ ] All pages render correctly on 375px mobile width
- [ ] Ad generation works when OmniRoute is available, shows clear error when not
- [ ] Landing page template creation works end-to-end
- [ ] Dashboard shows non-zero demo data
- [ ] All test suites pass: E2E, API, frontend, smoke, integration, functional
