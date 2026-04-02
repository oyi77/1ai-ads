import { v4 as uuid } from 'uuid';

export function makeAd(overrides = {}) {
  return {
    id: uuid(),
    name: 'Test Ad',
    product: 'Test Product',
    target: 'Test Audience',
    keunggulan: 'Fast and reliable',
    platform: 'meta',
    format: 'single_image',
    content_model: 'P.A.S',
    hook: 'Struggling with X?',
    body: 'Try our solution',
    cta: 'Buy Now',
    tags: '[]',
    status: 'draft',
    ...overrides,
  };
}

export function makeLandingPage(overrides = {}) {
  return {
    id: uuid(),
    name: 'Test Landing Page',
    template: 'dark',
    theme: 'dark',
    product_name: 'Test Product',
    price: 'Rp 500.000',
    pain_points: '["Slow delivery","High cost"]',
    benefits: '["Fast shipping","Low price"]',
    cta_primary: 'Order Now',
    cta_secondary: 'Learn More',
    wa_link: 'https://wa.me/628123456789',
    checkout_link: 'https://checkout.example.com',
    status: 'draft',
    ...overrides,
  };
}

export function makeCampaign(overrides = {}) {
  return {
    id: uuid(),
    platform: 'meta',
    campaign_id: 'camp_123',
    name: 'Test Campaign',
    status: 'active',
    budget: 1000000,
    spend: 500000,
    impressions: 100000,
    clicks: 5000,
    conversions: 100,
    roas: 3.5,
    ...overrides,
  };
}
