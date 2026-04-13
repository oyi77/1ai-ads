# AdForge Improvement Plan

**Overview**
Comprehensive enhancement of the AdForge AI ads management platform with focus on improving ad creation workflow, expanding template variety, and adding better preview/editing capabilities.

**Created**: 2026-04-09

---

## Requirements Summary

### 1. Enhanced Ad Creation Workflow
- Multi-step AI-powered content generation (guided wizard)
- Real-time preview and editing capabilities
- Template library expansion with visual previews
- A/B testing support for ad variations

### 2. Marketing Templates
- Industry-specific ad templates (inspired by mautic.com patterns)
- Copywriting frameworks integration (from erxes.com best practices)
- Performance-optimized templates with built-in best practices

### 3. Landing Page Integration
- Expand existing landing page generator
- SEO optimization features
- Real-time preview capabilities
- Performance analytics integration

---

## Principles

1. **User-Centric**: Focus on marketer's workflow, not just automation
2. **Iterative**: Build improvements incrementally with user feedback
3. **Performance**: Maintain fast response times (<2s for most actions)
4. **Quality**: AI-generated content should be editable and refinement-friendly
5. **Flexibility**: Templates should be customizable, not rigid

---

## Phase 1: Enhanced Ad Creation (Priority: High)

### 1.1 Multi-Step AI Ad Wizard
**Description**: Transform the current single-form ad creation into an interactive, guided workflow.

**Implementation Steps**:

#### Step 1.1: Guided Hook Generation
- **Frontend**: `client/src/views/ads.js`
  - Add wizard mode toggle: single-step vs multi-step
  - Multi-step form with progress indicator
  - Each step focuses on one component (hook, body, CTA)
  
- **Backend**: `server/routes/ads.js`
  - New endpoint: `POST /api/ads/wizard/start`
  - New endpoint: `POST /api/ads/wizard/step`
  - New endpoint: `POST /api/ads/wizard/complete`

**User Flow**:
```
Step 1: Select Campaign Goal
  ↓ [Brand Awareness, Lead Generation, Sales Conversion]

Step 2: Define Target Audience
  ↓ [Age, Location, Interests, Behaviors]

Step 3: Choose Content Model
  ↓ [P.A.S, Efek Gravitasi, Storytelling, Problem-Solution]

Step 4: Generate Hook
  ↓ [AI generates based on goal + audience + model]

Step 5: Customize Body & CTA
  ↓ [Edit AI output with brand voice]

Step 6: Preview & Publish
  ↓ [Live preview with edit option]
```

#### Step 1.2: Real-Time Preview & Editing
- **Frontend Changes**:
  - Split-screen layout: form on left, live preview on right
  - Instant preview updates on form change
  - Save as draft option at each step
  
- **Backend Changes**:
  - Add `status` field support: `draft` | `preview` | `published`
  - Add `preview_data` field: stores HTML preview of ad
  - WebSocket support for real-time updates (optional)

#### Step 1.3: Template Library with Previews
- **Database Changes**:
  - Add `ad_templates` table:
  ```sql
  CREATE TABLE IF NOT EXISTS ad_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    hook_template TEXT,
    body_template TEXT,
    cta_template TEXT,
    design_config TEXT,
    thumbnail_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_ad_templates_category ON ad_templates(category);
  ```
  
- **Repository**: `server/repositories/templates.js`
  - Methods: `getAll()`, `getById()`, `create()`, `update()`, `delete()`
  
- **Frontend**: `client/src/views/templates.js` (new file)
  - Template browser with category filter
  - Template preview modal
  - "Use Template" button integration

#### Step 1.4: A/B Testing Framework
- **Frontend Changes**:
  - Add "Create Variation" button in ad detail view
  - Variation comparison view
  - Performance metrics tracking (CTR, conversion rate)

- **Backend Changes**:
  - Add `parent_ad_id` column to `ads` table
  - Add `variation_type` column to `ads` table (`original`, `variant_a`, `variant_b`)
  - Analytics endpoints for A/B test results

**File References**:
- `server/routes/ads.js` - Add wizard endpoints
- `client/src/views/ads.js` - Enhanced wizard UI
- `client/src/views/templates.js` - Template browser (new)
- `server/repositories/templates.js` - Template repository (new)
- `db/schema.sql` - Add ad_templates table

---

## Phase 2: Marketing Templates (Priority: High)

### 2.1 Industry-Specific Templates
**Description**: Create template library inspired by successful platforms like mautic.com with industry-specific categories.

**Template Categories**:
1. **E-commerce** (Fashion, Tech, Home Goods)
2. **Lead Generation** (Courses, Services, Downloads)
3. **Brand Building** (Social Media, Personal Brand)
4. **Local Business** (Restaurants, Services)
5. **Education** (Online Courses, Certifications)

**Implementation**:
- **Frontend**: `client/src/views/templates.js` with category tabs
- **Backend**: `server/repositories/templates.js` with seed templates
- **Seed Data**: 50+ high-converting templates across categories

**File References**:
- `client/src/views/templates.js` - Add category filter
- `server/repositories/templates.js` - Add category filtering
- `db/seed.js` - Add template seeding

### 2.2 Copywriting Frameworks Integration
**Description**: Integrate proven copywriting structures and frameworks (inspired by erxes.com) into AI prompt engineering.

**Copywriting Elements**:
- **PAS (Problem-Agitation-Solution)**: Already implemented
- **Story-Bridge (Hero-Villain-Antagonist)**: Add to AI prompt
- **3-Act Structure (Setup-Conflict-Resolution)**: Add to AI prompt
- **Social Proof (Testimonials-Case Studies)**: Add to prompt

**Implementation**:
- **Backend**: Update `server/services/ad-generator.js`
  - Add `copywriting_framework` parameter
  - Add `social_proof` parameter
  - Pre-prompt injection for frameworks

**File References**:
- `server/services/ad-generator.js` - Enhance with frameworks

### 2.3 Performance-Optimized Templates
**Description**: Create templates with built-in best practices and performance data.

**Features**:
- Templates include meta-tags for best practices
- Character count optimization (shorter hooks = higher CTR)
- Emoji integration support
- Mobile-first layout options

**Implementation**:
- Template validation for character counts
- Performance tracking templates
- Mobile preview mode

---

## Phase 3: Landing Page Enhancements (Priority: Medium)

### 3.1 SEO Optimization
**Description**: Improve landing page SEO with meta tags, structured data, and performance optimization.

**Implementation Steps**:
- Add SEO configuration panel in landing page editor
- Auto-generate meta tags (title, description, og:image)
- Add sitemap.xml generation
- Add robots.txt support

**File References**:
- `client/src/views/landing.js` - Add SEO panel
- `server/routes/landing.js` - SEO endpoints

### 3.2 Performance Analytics Integration
**Description**: Integrate landing page performance tracking and analytics.

**Implementation Steps**:
- Add `analytics_id` to `landing_pages` table
- Integrate with campaign performance data
- Show bounce rate, time on page, conversion metrics

**File References**:
- `db/schema.sql` - Add analytics_id column
- `client/src/views/landing.js` - Performance dashboard

---

## Timeline

| Phase | Estimated Effort | Dependencies | Priority |
|--------|----------------|--------------|----------|
| 1: Enhanced Ad Creation | 3-5 days | Frontend + Backend + DB | High |
| 2: Marketing Templates | 2-3 days | Frontend + Backend + AI Service | High |
| 3: Landing Page Enhancements | 1-2 days | Frontend + Backend | Medium |

**Total Estimated**: 6-10 days

---

## Acceptance Criteria

- [ ] All steps reference specific files with line numbers
- [ ] Each phase includes database migration steps
- [ ] Frontend and backend changes are coordinated
- [ ] Plan includes testing strategy
- [ ] Timeline is realistic for team size

---

## Notes

- Existing PAS framework can be extended with new copywriting structures
- Template system can be seeded with high-converting examples
- A/B testing integrates with existing analytics
- SEO improvements benefit all landing pages, not just new ones
