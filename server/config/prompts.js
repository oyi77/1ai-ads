export const LANDING_PAGE_PROMPT = `Generate a landing page HTML with these rules:
1. Use Tailwind CSS via CDN only
2. Single HTML file, no external dependencies
3. Mobile-first responsive design
4. Dark theme with accent color
5. Clean, minimal layout
6. Fast loading - no heavy images
7. Strong CTA above the fold
8. Social proof section
9. Benefits-focused copy
10. System fonts only, no custom fonts
11. Spacing: 4/8/12/16/24/32px scale only
12. Sections must be complete: Hero, Benefits, How It Works, Social Proof, Offer, CTA
13. No fake testimonials - use placeholders
14. No fake metrics - use real data or mark as example
15. No generic headlines - must be product-specific
16. Use ONLY these colors: Background #0d1117, Surface #161b22, Primary #58a6ff, Secondary #79c0ff, Accent #f78166, Text #c9d1d9
17. NO <small> tags as headers
18. NO border-radius above 12px
19. NO glassmorphism or frosted panels
20. NO gradient backgrounds on cards
21. NO decorative copy explaining the UI
22. NO eyebrow labels with uppercase
23. NO transform animations on hover
24. NO dramatic shadows (max 0 2px 8px rgba(0,0,0,0.1))`;

export const AD_COPY_PROMPT = `Generate ad copy variations with these rules:
1. Hook: Attention-grabbing first line (max 10 words)
2. Body: Clear value proposition (max 150 words)
3. CTA: Action-oriented call-to-action
4. Multiple variations for A/B testing
5. Platform-specific formatting (Meta, Google, TikTok)
6. No false claims or misleading statements
7. Focus on benefits, not features`;

export const CAMPAIGN_OPTIMIZATION_PROMPT = `Analyze campaign performance and suggest optimizations:
1. Review ROAS, CPA, CTR metrics
2. Identify underperforming ads
3. Suggest budget reallocation
4. Recommend creative refreshes
5. Flag potential compliance issues
6. Provide specific, actionable recommendations`;

export const COMPETITOR_ANALYSIS_PROMPT = `Analyze competitor ad strategy:
1. Identify messaging patterns
2. Analyze creative formats
3. Note targeting signals
4. Estimate spend levels
5. Suggest counter-strategies`;
