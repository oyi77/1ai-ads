import { hashPassword } from '../server/lib/auth.js';

/**
 * Stable demo IDs — deterministic so INSERT OR IGNORE deduplicates on re-seed.
 * Using a human-readable format rather than random v4 UUIDs.
 */

// ── Users ──────────────────────────────────────────────────────────────────
const USERS = {
  admin: { id: 'demo-user-admin-00000000-0001', username: 'admin', email: 'admin@1ai-ads.test', role: 'admin', plan: 'pro' },
  demo:  { id: 'demo-user-demo-00000000-0002', username: 'demo',  email: 'demo@1ai-ads.test',  role: 'user',  plan: 'free' },
};

// ── Campaigns ──────────────────────────────────────────────────────────────
const CAMPAIGNS = [
  {
    id: 'demo-cmp-meta-summer-c01',
    platform: 'meta', campaign_id: '238000000000001', name: 'Summer Collection Launch', status: 'ACTIVE',
    budget: 5_000_000, spend: 2_500_000, revenue: 5_750_000,
    impressions: 85_000, clicks: 2_550, conversions: 145, roas: 2.3,
  },
  {
    id: 'demo-cmp-meta-flash-c02',
    platform: 'meta', campaign_id: '238000000000002', name: 'Flash Sale Weekend', status: 'ACTIVE',
    budget: 3_000_000, spend: 1_800_000, revenue: 4_500_000,
    impressions: 62_000, clicks: 2_170, conversions: 98, roas: 2.5,
  },
  {
    id: 'demo-cmp-meta-retarget-c03',
    platform: 'meta', campaign_id: '238000000000003', name: 'Retargeting - Abandoned Cart', status: 'ACTIVE',
    budget: 2_000_000, spend: 1_000_000, revenue: 3_000_000,
    impressions: 18_000, clicks: 720, conversions: 52, roas: 3.0,
  },
  {
    id: 'demo-cmp-google-brand-c04',
    platform: 'google', campaign_id: '678000000000001', name: 'Brand Search - Running Shoes', status: 'ACTIVE',
    budget: 4_000_000, spend: 2_000_000, revenue: 6_000_000,
    impressions: 40_000, clicks: 2_400, conversions: 200, roas: 3.0,
  },
  {
    id: 'demo-cmp-google-shopping-c05',
    platform: 'google', campaign_id: '678000000000002', name: 'Shopping - Sportswear', status: 'PAUSED',
    budget: 2_500_000, spend: 1_200_000, revenue: 1_800_000,
    impressions: 30_000, clicks: 1_200, conversions: 60, roas: 1.5,
  },
  {
    id: 'demo-cmp-google-display-c06',
    platform: 'google', campaign_id: '678000000000003', name: 'Display Network - Prospecting', status: 'ACTIVE',
    budget: 1_500_000, spend: 800_000, revenue: 1_600_000,
    impressions: 120_000, clicks: 960, conversions: 38, roas: 2.0,
  },
  {
    id: 'demo-cmp-tiktok-viral-c07',
    platform: 'tiktok', campaign_id: '998000000000001', name: 'TikTok Viral Challenge', status: 'ACTIVE',
    budget: 3_500_000, spend: 2_200_000, revenue: 3_300_000,
    impressions: 250_000, clicks: 3_750, conversions: 88, roas: 1.5,
  },
  {
    id: 'demo-cmp-tiktok-showcase-c08',
    platform: 'tiktok', campaign_id: '998000000000002', name: 'Product Showcase', status: 'PAUSED',
    budget: 2_000_000, spend: 1_500_000, revenue: 2_250_000,
    impressions: 180_000, clicks: 2_700, conversions: 65, roas: 1.5,
  },
];

// ── Ads — linked to campaigns via platform+campaign_id ─────────────────────
const ADS = [
  // Meta — Summer Collection
  { id: 'demo-ad-meta-summer-a01', name: 'Summer Vibes - Image Ad',      product: 'Running Shoes',       target: 'Active Users, 18-35',  platform: 'meta', campaignId: 'demo-cmp-meta-summer-c01', status: 'active',    format: 'single_image',   content_model: 'hook_body_cta', hook: '☀️ Ready for summer run? Get 20% OFF on all running shoes!', body: 'Limited time offer on our best-selling summer collection. Lightweight, breathable, and ready for any terrain.', cta: 'Shop Now', tags: '["summer","running","shoes"]' },
  { id: 'demo-ad-meta-summer-a02', name: 'Summer Vibes - Video Ad',      product: 'Running Shoes',       target: 'Runners, Marathon Prep', platform: 'meta', campaignId: 'demo-cmp-meta-summer-c01', status: 'active',    format: 'video',          content_model: 'hook_body_cta', hook: '🏃‍♂️ 30 seconds that will change your run forever!', body: 'See how our new cushioning technology absorbs impact and returns energy with every stride.', cta: 'Learn More', tags: '["video","running","summer"]' },
  { id: 'demo-ad-meta-summer-a03', name: 'Summer Vibes - Carousel',      product: 'Active Wear',         target: 'Fitness Enthusiasts',  platform: 'meta', campaignId: 'demo-cmp-meta-summer-c01', status: 'active',    format: 'carousel',       content_model: 'hook_body_cta', hook: '🔥 3 looks, one summer — which one is yours?', body: 'Swipe through our curated summer activewear collection. Mix, match, and save up to 25%.', cta: 'Browse Collection', tags: '["carousel","activewear","summer"]' },
  // Meta — Flash Sale
  { id: 'demo-ad-meta-flash-a04',  name: 'Flash Sale - Urgency',          product: 'Sport Sandals',       target: 'Beach Goers, Travelers', platform: 'meta', campaignId: 'demo-cmp-meta-flash-c02', status: 'active',    format: 'single_image',   content_model: 'hook_body_cta', hook: '⏰ 12 HOURS LEFT! Up to 50% OFF sport sandals!', body: 'Flash sale ends tonight. Grab your favorite styles before they are gone. Free shipping on all orders.', cta: 'Shop Flash Sale', tags: '["flash-sale","sandals","urgent"]' },
  { id: 'demo-ad-meta-flash-a05',  name: 'Flash Sale - Social Proof',     product: 'Water Bottles',       target: 'Gym Goers, 25-45',     platform: 'meta', campaignId: 'demo-cmp-meta-flash-c02', status: 'active',    format: 'single_image',   content_model: 'hook_body_cta', hook: '💧 10K+ sold this week! Why wait?', body: 'Join thousands of happy customers. Our insulated water bottle keeps drinks cold for 24 hours.', cta: 'Get Yours Now', tags: '["bestseller","water-bottle","flash-sale"]' },
  // Meta — Retargeting
  { id: 'demo-ad-meta-retarget-a06', name: 'Retarget - Still Thinking?',  product: 'Running Shoes',       target: 'Website Visitors, 30d',  platform: 'meta', campaignId: 'demo-cmp-meta-retarget-c03', status: 'active',    format: 'single_image',   content_model: 'hook_body_cta', hook: '👀 Still thinking about those running shoes?', body: 'Your cart is waiting! Complete your purchase now and enjoy free shipping + 10% off your first order.', cta: 'Complete Order', tags: '["retarget","cart","abandoned"]' },
  // Google — Brand Search
  { id: 'demo-ad-google-brand-a07', name: 'Brand Search - Headline',      product: 'Premium Sneakers',    target: 'Brand Keywords',       platform: 'google', campaignId: 'demo-cmp-google-brand-c04', status: 'active',    format: 'text',           content_model: 'hook_body_cta', hook: 'Official Store - Premium Sneakers', body: 'Shop the latest collection, direct from the manufacturer. 30-day return guarantee.', cta: 'Shop Now', tags: '["search","brand","sneakers"]' },
  { id: 'demo-ad-google-brand-a08', name: 'Brand Search - Promotion',     product: 'Running Shoes',       target: 'Brand + Discount Keywords', platform: 'google', campaignId: 'demo-cmp-google-brand-c04', status: 'active',    format: 'text',           content_model: 'hook_body_cta', hook: 'Up to 40% OFF Running Shoes', body: 'Limited time promotion on our entire running collection. Free delivery above Rp 300K.', cta: 'Get Discount', tags: '["search","discount","running"]' },
  // Google — Shopping
  { id: 'demo-ad-google-shop-a09',  name: 'Shopping - Sport Shoes',       product: 'Sport Shoes - All',    target: 'Shopping Intent',      platform: 'google', campaignId: 'demo-cmp-google-shopping-c05', status: 'paused',    format: 'shopping',       content_model: 'hook_body_cta', hook: 'Sport Shoes - Compare Prices', body: 'Find your perfect fit with our wide selection of sport shoes from top brands.', cta: 'View Products', tags: '["shopping","shoes","sports"]' },
  { id: 'demo-ad-google-shop-a10',  name: 'Shopping - Apparel',           product: 'Active Apparel',      target: 'Shopping Intent',      platform: 'google', campaignId: 'demo-cmp-google-shopping-c05', status: 'paused',    format: 'shopping',       content_model: 'hook_body_cta', hook: 'Active Apparel Collection', body: 'Premium activewear for men and women. Breathable fabrics, ergonomic design.', cta: 'Browse', tags: '["shopping","apparel","activewear"]' },
  // Google — Display
  { id: 'demo-ad-google-display-a11', name: 'Display - Prospecting',      product: 'Fitness Tracker',     target: 'Health & Fitness',     platform: 'google', campaignId: 'demo-cmp-google-display-c06', status: 'active',    format: 'image',          content_model: 'hook_body_cta', hook: '🏃 Track every step, sleep, and calorie.', body: 'Discover our smart fitness tracker. Water resistant, 14-day battery, heart rate monitoring.', cta: 'Learn More', tags: '["display","fitness","tracker"]' },
  // TikTok — Viral
  { id: 'demo-ad-tiktok-viral-a12', name: 'TikTok - Dance Challenge',     product: 'Running Shoes',       target: 'Gen Z, 16-24',         platform: 'tiktok', campaignId: 'demo-cmp-tiktok-viral-c07', status: 'active',    format: 'video',          content_model: 'hook_body_cta', hook: '🎵 Can you keep up? New dance challenge with our comfiest shoes!', body: 'Show us your moves wearing our spring collection. Best entries win Rp 1.000.000!', cta: 'Join Challenge', tags: '["tiktok","viral","challenge"]' },
  { id: 'demo-ad-tiktok-viral-a13', name: 'TikTok - Unboxing',            product: 'Sneakers',            target: 'Sneakerheads, 18-30',  platform: 'tiktok', campaignId: 'demo-cmp-tiktok-viral-c07', status: 'active',    format: 'video',          content_model: 'hook_body_cta', hook: '📦 UNBOXING: These limited edition sneakers are FIRE! 🔥', body: 'First look at our newest collaboration. Only 500 pairs available — get yours before they sell out.', cta: 'Shop Limited Edition', tags: '["tiktok","unboxing","limited"]' },
  // TikTok — Showcase
  { id: 'demo-ad-tiktok-showcase-a14', name: 'TikTok - Product Demo',     product: 'Backpack',            target: 'College Students',     platform: 'tiktok', campaignId: 'demo-cmp-tiktok-showcase-c08', status: 'paused',    format: 'video',          content_model: 'hook_body_cta', hook: '🎒 Fit everything in this ONE backpack!', body: 'Ergonomic design with 32L capacity, USB charging port, and anti-theft pocket — perfect for campus.', cta: 'Buy Now', tags: '["tiktok","backpack","college"]' },
  { id: 'demo-ad-tiktok-showcase-a15', name: 'TikTok - Testimonial',      product: 'Fitness Tracker',     target: 'Health Conscious',     platform: 'tiktok', campaignId: 'demo-cmp-tiktok-showcase-c08', status: 'paused',    format: 'video',          content_model: 'hook_body_cta', hook: '⭐ "Lost 5kg in a month using this!" - Real review', body: 'Real results from real customers. Our fitness tracker helped thousands reach their goals.', cta: 'Start Your Journey', tags: '["tiktok","testimonial","fitness"]' },
];

// ── Landing Pages ─────────────────────────────────────────────────────────
const LANDING_PAGES = [
  {
    id: 'demo-lp-summer-campaign-01', name: 'Summer Collection Launch',
    template: 'tpl_new_arrival', theme: 'light',
    product_name: 'Running Shoes', price: 'Rp 299.000',
    pain_points: '["Sweaty feet during runs","Shoes wear out too fast","Lack of arch support"]',
    benefits: '["Breathable mesh fabric","Non-slip rubber outsole","Memory foam insole"]',
    cta_primary: 'Shop Now', cta_secondary: 'Learn More',
    wa_link: 'https://wa.me/628123456789?text=Summer%20Shoes', checkout_link: 'https://checkout.example.com/summer',
    slug: 'summer-collection', is_published: 1, status: 'published',
  },
  {
    id: 'demo-lp-flash-sale-02', name: 'Flash Sale Weekend',
    template: 'tpl_flash_sale', theme: 'dark',
    product_name: 'Sport Sandals', price: 'Rp 149.000',
    pain_points: '["Boring footwear options","Uncomfortable for long walks","Poor quality materials"]',
    benefits: '["Waterproof and durable","Ergonomic footbed","Lightweight design"]',
    cta_primary: 'Get 50% OFF', cta_secondary: 'View Catalog',
    wa_link: 'https://wa.me/628123456789?text=Flash%20Sale', checkout_link: 'https://checkout.example.com/flash',
    slug: 'flash-sale-weekend', is_published: 1, status: 'published',
  },
  {
    id: 'demo-lp-fitness-03', name: 'Free Fitness Consultation',
    template: 'tpl_consultation_offer', theme: 'light',
    product_name: 'Fitness Tracker', price: 'Rp 499.000',
    pain_points: '["Cant track progress","Uncertain about workout plans","Lack of motivation"]',
    benefits: '["24/7 heart rate monitoring","AI-powered workout suggestions","Weekly progress reports"]',
    cta_primary: 'Book Free Session', cta_secondary: 'Learn More',
    wa_link: 'https://wa.me/628123456789?text=Fitness%20Tracker', checkout_link: 'https://checkout.example.com/fitness',
    slug: 'free-consultation', is_published: 1, status: 'published',
  },
  {
    id: 'demo-lp-webinar-04', name: 'Digital Marketing Webinar',
    template: 'tpl_webinar_signup', theme: 'dark',
    product_name: 'Online Course Bundle', price: 'Rp 99.000',
    pain_points: '["No sales coming in","Confused about ads","Wasting ad budget"]',
    benefits: '["Step-by-step ad setup guide","Real case studies","Live Q&A session"]',
    cta_primary: 'Reserve My Spot', cta_secondary: 'See Topics',
    wa_link: 'https://wa.me/628123456789?text=Webinar', checkout_link: 'https://checkout.example.com/webinar',
    slug: 'marketing-webinar', is_published: 0, status: 'draft',
  },
  {
    id: 'demo-lp-brand-launch-05', name: 'Brand Launch - Sportswear Pro',
    template: 'tpl_brand_launch', theme: 'dark',
    product_name: 'Premium Sportswear', price: 'Rp 599.000',
    pain_points: '["Low quality gear","Uncomfortable during workouts","Dull designs"]',
    benefits: '["Premium moisture-wicking fabric","Sleek modern designs","Full satisfaction guarantee"]',
    cta_primary: 'Be an Early Adopter', cta_secondary: 'See Collection',
    wa_link: 'https://wa.me/628123456789?text=Brand%20Launch', checkout_link: 'https://checkout.example.com/brand',
    slug: 'sportswear-launch', is_published: 1, status: 'published',
  },
];

// ── Platform Accounts ──────────────────────────────────────────────────────
const PLATFORM_ACCOUNTS = [
  { id: 'demo-pa-meta-01',   platform: 'meta',   account_name: 'Meta Business - Demo Store',   credentials: '{"access_token":"demo-meta-token-abcdef123456","ad_account_id":"238000000000001"}', is_active: 1, health_status: 'ok' },
  { id: 'demo-pa-google-01', platform: 'google', account_name: 'Google Ads - Demo Store',      credentials: '{"client_id":"demo-google-client-123","customer_id":"6780000000"}',              is_active: 1, health_status: 'ok' },
];

// ── Performance History (daily snapshots for last 7 days) ─────────────────
function generatePerformanceHistory() {
  const history = [];
  const now = new Date();
  for (let dayOffset = 7; dayOffset >= 1; dayOffset--) {
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const dayLabel = date.toISOString().slice(0, 10);

    for (const cmp of CAMPAIGNS) {
      const dailyFactor = 1 / 30;
      const dailyImpressions = Math.round(cmp.impressions * dailyFactor * (0.8 + Math.random() * 0.4));
      const dailyClicks = Math.round(dailyImpressions * (cmp.clicks / cmp.impressions) * (0.85 + Math.random() * 0.3));
      const dailySpend = +(cmp.spend * dailyFactor * (0.85 + Math.random() * 0.3)).toFixed(0);
      const dailyConversions = Math.round(cmp.conversions * dailyFactor * (0.8 + Math.random() * 0.4));
      const ctr = dailyImpressions > 0 ? +((dailyClicks / dailyImpressions) * 100).toFixed(2) : 0;
      const cpc = dailyClicks > 0 ? +(dailySpend / dailyClicks).toFixed(0) : 0;

      history.push({
        id: `demo-ph-${cmp.platform}-${dateStr}-${cmp.id.slice(-4)}`,
        campaign_id: cmp.id,
        snapshot_date: dayLabel,
        platform: cmp.platform,
        impressions: dailyImpressions,
        clicks: dailyClicks,
        spend: dailySpend,
        conversions: dailyConversions,
        ctr,
        cpc,
      });
    }
  }
  return history;
}

export function seedTemplates(db, adminUserId) {
  const templates = [
    // E-commerce templates
    {
      id: 'tpl_flash_sale',
      category: 'ecommerce',
      name: 'Flash Sale Weekend',
      description: 'Promote time-limited offers with urgency and scarcity',
      hook_template: '🔥 {product_name} - {discount}% OFF for {hours_left}!',
      body_template: 'Limited time offer! Get {discount} OFF when you buy now. Free shipping on orders over {min_amount}.',
      cta_template: 'Shop Now - Free Shipping',
      design_config: JSON.stringify({ style: 'urgent', color: '#ef4444' })
    },
    {
      id: 'tpl_new_arrival',
      category: 'ecommerce',
      name: 'New Product Launch',
      description: 'Announce new products with exclusivity and social proof',
      hook_template: '✨ Introducing: {product_name}! ✨ Be first to experience exclusive early-bird access.',
      body_template: '🎉 Join waitlist · {reward_1} early access for VIPs 🎉\n🎉 {reward_2} Get exclusive discounts when you invite friends.',
      cta_template: 'Join Waitlist → Get VIP Access',
      design_config: JSON.stringify({ style: 'exciting', color: '#6366f1' })
    },
    {
      id: 'tpl_best_seller',
      category: 'ecommerce',
      name: 'Best Seller of {month}',
      description: 'Highlight top-performing seller or brand recognition',
      hook_template: '🏆 {brand_name} is #{rank} this month\'s top performer!',
      body_template: 'Show your excellence with {sales_amount} in {month}. Win exclusive badges and rewards.',
      cta_template: 'View Leaderboard',
      design_config: JSON.stringify({ style: 'achievement', color: '#fbbf24' })
    },

    // Lead Generation templates
    {
      id: 'tpl_free_lead',
      category: 'lead_gen',
      name: 'Free Course Lead Magnet',
      description: 'Attract potential students with valuable free resource offer',
      hook_template: '📚 Get started today! · {course_name} is FREE · {seats_left} seats remaining · Limited time offer · {cta_verb} now',
      body_template: '🎓 Master high-income skills like {skill_1}, {skill_2}, and {skill_3} in just {duration_weeks}.\n\n⚡ Limited spots - Enroll today!',
      cta_template: 'Start Free Course → Get Premium',
      design_config: JSON.stringify({ style: 'educational', color: '#8b5cf6' })
    },
    {
      id: 'tpl_webinar_signup',
      category: 'lead_gen',
      name: 'Webinar Registration',
      description: 'Promote upcoming webinar with FOMO (Fear Of Missing Out)',
      hook_template: '📺 Don\'t miss out! · {webinar_name} · {date} at {time} · Only {spots_left} spots remaining',
      body_template: 'Join expert {speaker_1} for {duration_min} min Q&A session. Get exclusive workbook.\n\n⚠️ Hurry! Limited seats.',
      cta_template: 'Register Free Spot → Reserve Premium Seat',
      design_config: JSON.stringify({ style: 'urgency', color: '#dc2626' })
    },

    // Brand Building templates
    {
      id: 'tpl_brand_launch',
      category: 'brand',
      name: 'Brand Launch Campaign',
      description: 'Introduce new brand or product line to market',
      hook_template: '🚀 {brand_name} Launch Day! 🚀\n\nBe first to experience {product_name}.\n\nEarly bird pricing for first {early_bird_count} users!',
      body_template: '🎁 {slogan_placeholder}\n\n📦 Limited launch offer for early adopters.\n📞 Sign up for brand alerts.',
      cta_template: 'Learn More → Get Exclusive Access',
      design_config: JSON.stringify({ style: 'bold', color: '#2563eb' })
    },
    {
      id: 'tpl_seasonal_promo',
      category: 'brand',
      name: 'Seasonal Promotion',
      description: 'Create urgency-driven seasonal campaigns with limited-time offers',
      hook_template: '🎃 {season} Sale is LIVE! 🎃\n\nGet {discount_amount}% OFF storewide · {products_category} collection\n\n⏰ Limited time - While supplies last!',
      body_template: 'Shop {season} collection before it\'s gone.\n\nGet notified for restock → Get VIP early access.',
      cta_template: 'Shop Collection',
      design_config: JSON.stringify({ style: 'seasonal', color: '#eab308' })
    },

    // Local Business templates
    {
      id: 'tpl_grand_opening',
      category: 'local_business',
      name: 'Grand Opening',
      description: 'Promote grand opening event for local business',
      hook_template: '🎉 {business_name} Grand Opening! 🎉\n\nJoin us for {offer_details}.\n\n📍 {location} · {date} at {time}\n\n🎫 Get {incentive} when you bring 3 friends.',
      body_template: 'Exclusive opening event with VIP perks.\n\nRSVP for priority booking.',
      cta_template: 'RSVP Now → Get VIP Access',
      design_config: JSON.stringify({ style: 'celebration', color: '#d4af37' })
    },
    {
      id: 'tpl_limited_offer',
      category: 'local_business',
      name: 'Limited Time Offer',
      description: 'Create urgency with time-limited discount or bonus',
      hook_template: '⏰ Time\'s running out! ⏰\n\nGet {discount_amount}% OFF - Limited time.\n\nAct now before offer expires.',
      body_template: 'Unlock {bonus_reward} when you spend {min_spend} or refer {referrals_count} friends.',
      cta_template: 'Act Now',
      design_config: JSON.stringify({ style: 'urgent', color: '#dc2626' })
    },

    // Health/Wellness templates
    {
      id: 'tpl_fitness_challenge',
      category: 'health',
      name: 'Fitness Challenge',
      description: 'Create 30-day fitness challenge with progress tracking',
      hook_template: '💪 {days_left}/30 Days Left! 💪\n\nTrack your progress and earn rewards.\n\n🏆 Join {challenge_name} - Win {reward}!',
      body_template: 'Daily workout plans with video guides.\n\n🎉 Final day: Submit results and get {completion_reward}.\n\nLimited spots - Sign up early!',
      cta_template: 'Start Challenge',
      design_config: JSON.stringify({ style: 'energetic', color: '#10b981' })
    },
    {
      id: 'tpl_consultation_offer',
      category: 'health',
      name: 'Free Consultation',
      description: 'Offer free initial consultation to drive conversion',
      hook_template: '🩺 First session FREE! 🩺\n\nGet {duration_min} min personalized health assessment.\n\nBook your follow-up sessions to continue your journey.',
      body_template: 'Expert advice on {topics}.\n\nLimited spots available.',
      cta_template: 'Book Free Session',
      design_config: JSON.stringify({ style: 'professional', color: '#0891b2' })
    },

    // Tech/SaaS templates
    {
      id: 'tpl_feature_announce',
      category: 'saas',
      name: 'Feature Announcement',
      description: 'Announce new product features or updates',
      hook_template: '🚀 New Feature! 🚀\n\n{feature_name} is now LIVE!\n\n✨ {benefit_1} - {benefit_2} - {benefit_3}\n\nEarly adopters get {early_bird_discount}!\n\n📞 Update now → See what\'s new',
      body_template: 'Discover to power of {feature_name}.\n\nStreamline your workflow.',
      cta_template: 'Try for Free → Upgrade to Pro',
      design_config: JSON.stringify({ style: 'modern', color: '#6366f1' })
    },
    {
      id: 'tpl_beta_invite',
      category: 'saas',
      name: 'Beta Program Invite',
      description: 'Invite users to join beta testing program',
      hook_template: '🔬 Be a beta tester! 🔬\n\nGet early access to {feature_name} before anyone else.\n\nShape future with your feedback.\n\nLimited spots - Join waitlist.',
      body_template: 'Exclusive beta features + {reward_program}.\n\nFirst {early_adopter_count} get access.',
      cta_template: 'Join Beta Program',
      design_config: JSON.stringify({ style: 'exclusive', color: '#7c3aed' })
    },

    // Educational templates
    {
      id: 'tpl_course_launch',
      category: 'education',
      name: 'Course Launch',
      description: 'Promote new online course with enrollment incentives',
      hook_template: '📚 New Course Alert! 📚\n\n{course_name} is now OPEN for enrollment!\n\n🎓 {early_bird_discount} - Limited time!\n\n📚 {seats_left} seats available.\n\n✨ {instructor_name} teaching live · {duration} {duration_weeks} weeks.\n\nEnroll now → Get {completion_certificate}!',
      body_template: 'Course description with {topics}.\n\nSelf-paced learning schedule.\n\nInteractive exercises and quizzes.',
      cta_template: 'Enroll Now → Get Access',
      design_config: JSON.stringify({ style: 'academic', color: '#059669' })
    },

    // Non-profit templates
    {
      id: 'tpl_donation_drive',
      category: 'nonprofit',
      name: 'Donation Drive',
      description: 'Create urgency-driven donation campaign',
      hook_template: '❤️ Make a difference! ❤️\n\n{cause_name} needs your help.\n\nEvery donation counts towards {goal_amount}.\n\nImpact meters show real progress.\n\n{donation_tier} - Unlock {reward} when you reach {tier}!',
      body_template: 'Join {cause_name} today.\n\nTogether we can {impact_statement}.\n\n🎉 Thank you for your support!',
      cta_template: 'Donate Now → Get {reward_name}!',
      design_config: JSON.stringify({ style: 'heartfelt', color: '#e11d48' })
    }
  ];

  templates.forEach(tpl => {
    db.prepare(`
      INSERT OR IGNORE INTO templates (id, user_id, category, name, description,
        hook_template, body_template, cta_template,
        design_config, thumbnail_url, industry, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      tpl.id,
      adminUserId,
      tpl.category,
      tpl.name,
      tpl.description,
      tpl.hook_template,
      tpl.body_template,
      tpl.cta_template,
      tpl.design_config,
      '',
      tpl.industry || ''
    );
  });

  console.log(`Seeded ${templates.length} templates`);
}

export function seedUsers(db) {
  const passwordHash = hashPassword(process.env.ADMIN_PASSWORD || 'admin123');

  // Create admin user if not exists — stable ID for dedup
  db.prepare(`
    INSERT OR IGNORE INTO users (id, username, email, password_hash, role, plan, confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
  `).run(USERS.admin.id, USERS.admin.username, USERS.admin.email, passwordHash, USERS.admin.role, USERS.admin.plan);

  // Create demo user
  db.prepare(`
    INSERT OR IGNORE INTO users (id, username, email, password_hash, role, plan, confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
  `).run(USERS.demo.id, USERS.demo.username, USERS.demo.email, passwordHash, USERS.demo.role, USERS.demo.plan);

  console.log('Seeded demo users');
}

export function seedDemoData(db) {
  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    seedUsers(db);
    const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    const adminUserId = adminUser ? adminUser.id : USERS.admin.id;
    seedTemplates(db, adminUserId);

  // ── Campaigns ─────────────────────────────────────────────────────────
  const insertCampaign = db.prepare(`
    INSERT OR IGNORE INTO campaigns (id, user_id, platform, campaign_id, name, status, budget, spend, revenue, impressions, clicks, conversions, roas, last_synced, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  let seededCampaigns = 0;
  for (const c of CAMPAIGNS) {
    insertCampaign.run(c.id, adminUserId, c.platform, c.campaign_id, c.name, c.status, c.budget, c.spend, c.revenue, c.impressions, c.clicks, c.conversions, c.roas);
    seededCampaigns++;
  }

  // ── Ads ───────────────────────────────────────────────────────────────
  const insertAd = db.prepare(`
    INSERT OR IGNORE INTO ads (id, user_id, name, product, target, platform, format, content_model, hook, body, cta, tags, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  let seededAds = 0;
  for (const a of ADS) {
    insertAd.run(a.id, adminUserId, a.name, a.product, a.target, a.platform, a.format, a.content_model, a.hook, a.body, a.cta, a.tags, a.status);
    seededAds++;
  }

  // ── Landing Pages ─────────────────────────────────────────────────────
  const insertLP = db.prepare(`
    INSERT OR IGNORE INTO landing_pages (id, user_id, name, template, theme, product_name, price, pain_points, benefits, cta_primary, cta_secondary, wa_link, checkout_link, slug, is_published, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  let seededLps = 0;
  for (const lp of LANDING_PAGES) {
    insertLP.run(lp.id, adminUserId, lp.name, lp.template, lp.theme, lp.product_name, lp.price, lp.pain_points, lp.benefits, lp.cta_primary, lp.cta_secondary, lp.wa_link, lp.checkout_link, lp.slug, lp.is_published, lp.status);
    seededLps++;
  }

  // ── Platform Accounts ─────────────────────────────────────────────────
  
  const insertPA = db.prepare(`
    INSERT OR IGNORE INTO platform_accounts (id, user_id, platform, account_name, credentials, is_active, health_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  let seededPas = 0;
  for (const pa of PLATFORM_ACCOUNTS) {
    insertPA.run(pa.id, adminUserId, pa.platform, pa.account_name, pa.credentials, pa.is_active, pa.health_status);
    seededPas++;
  }

  // ── Performance History ───────────────────────────────────────────────
  const insertPH = db.prepare(`
    INSERT OR IGNORE INTO performance_history (id, campaign_id, snapshot_date, platform, impressions, clicks, spend, conversions, ctr, cpc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const history = generatePerformanceHistory();
  let seededPh = 0;
  for (const h of history) {
    insertPH.run(h.id, h.campaign_id, h.snapshot_date, h.platform, h.impressions, h.clicks, h.spend, h.conversions, h.ctr, h.cpc);
    seededPh++;
  }

  // ── Approval Drafts ────────────────────────────────────────────────────
  let seededDrafts = 0;
  const insertDraft = db.prepare(`
    INSERT OR IGNORE INTO approval_drafts (id, type, summary, details_json, proposed_by, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  insertDraft.run('demo-draft-flash-sale-0001', 'campaign', 'Flash Sale Campaign Draft',
    JSON.stringify({ campaign_name: 'Flash Sale Weekend', budget: 5000000, platforms: ['meta'], duration: '3 days' }),
    'ai', 'pending');
  seededDrafts++;
  insertDraft.run('demo-draft-new-product-002', 'ad', 'New Product Launch Ad',
    JSON.stringify({ product_name: 'Sport Watch Pro', hook: 'Time meets performance', target_audience: 'Athletes, 25-45' }),
    'ai', 'pending');
  seededDrafts++;
  insertDraft.run('demo-draft-retarget-00003', 'campaign', 'Retargeting Strategy Update',
    JSON.stringify({ strategy: 'Abandoned cart retargeting', lookback_window: '14 days', budget_increase: '20%' }),
    'ai', 'approved');
  seededDrafts++;

  // ── A/B Tests ───────────────────────────────────────────────────────────
  let seededAbTests = 0;
  const insertAbTest = db.prepare(`
    INSERT OR IGNORE INTO ab_tests (id, name, campaign_id, status, metric, confidence, winner_id, config, started_at, stopped_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const insertAbVariant = db.prepare(`
    INSERT OR IGNORE INTO ab_test_variants (id, test_id, ad_id, creative_id, name, hook, body, variant_index, impressions, clicks, spend, conversions, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  insertAbTest.run('demo-abt-hook-headline-01', 'Hook Headline Test', 'demo-cmp-meta-summer-c01',
    'running', 'ctr', 0.95, null, '{}', new Date(Date.now() - 5 * 86400000).toISOString(), null);
  insertAbVariant.run('demo-abv-hook-benefit-01', 'demo-abt-hook-headline-01', null, null,
    'Benefit-focused hook', 'Get 20% better performance with our shoes', 'Engineered for speed and comfort.', 0, 12500, 450, 180000, 22);
  insertAbVariant.run('demo-abv-hook-curious-02', 'demo-abt-hook-headline-01', null, null,
    'Curiosity hook', 'Why are elite runners switching to these shoes?', 'The secret is in the sole technology.', 1, 12800, 520, 185000, 28);
  seededAbTests++;
  insertAbTest.run('demo-abt-cta-button-002', 'CTA Button Test', 'demo-cmp-meta-flash-c02',
    'completed', 'conversion_rate', 0.98, 'demo-abv-cta-variant-a1', '{}', new Date(Date.now() - 14 * 86400000).toISOString(), new Date(Date.now() - 2 * 86400000).toISOString());
  insertAbVariant.run('demo-abv-cta-variant-a1', 'demo-abt-cta-button-002', null, null,
    'Variant A', 'Shop Now — Limited Time', 'Dont miss out on our biggest sale.', 0, 25000, 1100, 350000, 65);
  insertAbVariant.run('demo-abv-cta-variant-b2', 'demo-abt-cta-button-002', null, null,
    'Variant B', 'Grab Yours Before Theyre Gone', 'Only 24 hours left at this price.', 1, 24500, 980, 340000, 52);
  seededAbTests++;

  // ── Dashboard Widgets ───────────────────────────────────────────────────
  let seededWidgets = 0;
  const insertWidget = db.prepare(`
    INSERT OR IGNORE INTO dashboard_widgets (id, user_id, widget_type, config, position, size)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertWidget.run('demo-widget-000001', adminUserId, 'metric',
    JSON.stringify({ name: 'Total Spend', description: 'Total ad spend across all platforms', type: 'metric', enabled: true }),
    0, 'medium');
  insertWidget.run('demo-widget-000002', adminUserId, 'chart',
    JSON.stringify({ name: 'Revenue Trend', description: 'Revenue over time', type: 'chart', enabled: true }),
    1, 'large');
  insertWidget.run('demo-widget-000003', adminUserId, 'metric',
    JSON.stringify({ name: 'ROAS Gauge', description: 'Return on ad spend indicator', type: 'metric', enabled: true }),
    2, 'small');
  insertWidget.run('demo-widget-000004', adminUserId, 'chart',
    JSON.stringify({ name: 'Platform Split', description: 'Spend distribution by platform', type: 'chart', enabled: true }),
    3, 'medium');
  seededWidgets = 4;

  // ── Competitor Snapshots ────────────────────────────────────────────────
  let seededCompetitors = 0;
  const insertComp = db.prepare(`
    INSERT OR IGNORE INTO competitor_snapshots (id, url, platform, ad_data, snapshot_type, captured_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  insertComp.run('demo-comp-0000001', 'competitor-a.com', 'meta', JSON.stringify({
    ads_count: 5, total: 5,
    ads: [
      { id: 'ca-1', ad_text: 'Summer Sale — Up to 40% OFF', media_type: 'image', platform: 'meta', page_name: 'Competitor A' },
      { id: 'ca-2', ad_text: 'New Collection Just Dropped', media_type: 'video', platform: 'meta', page_name: 'Competitor A' },
      { id: 'ca-3', ad_text: 'Free Shipping on All Orders', media_type: 'image', platform: 'meta', page_name: 'Competitor A' },
      { id: 'ca-4', ad_text: 'Limited Edition — Shop Now', media_type: 'carousel', platform: 'meta', page_name: 'Competitor A' },
      { id: 'ca-5', ad_text: 'Customer Favorites Under $50', media_type: 'image', platform: 'meta', page_name: 'Competitor A' },
    ],
  }), 'auto');
  seededCompetitors++;
  insertComp.run('demo-comp-0000002', 'competitor-b.com', 'google', JSON.stringify({
    ads_count: 3, total: 3,
    ads: [
      { id: 'cb-1', ad_text: 'Premium Quality at Best Price', media_type: 'text', platform: 'google', page_name: 'Competitor B' },
      { id: 'cb-2', ad_text: 'Shop the Latest Trends', media_type: 'shopping', platform: 'google', page_name: 'Competitor B' },
      { id: 'cb-3', ad_text: 'Exclusive Online Deals', media_type: 'text', platform: 'google', page_name: 'Competitor B' },
    ],
  }), 'auto');
  seededCompetitors++;
  insertComp.run('demo-comp-0000003', 'competitor-c.com', 'tiktok', JSON.stringify({
    ads_count: 8, total: 8,
    ads: [
      { id: 'cc-1', ad_text: 'Viral Product Everyone Wants', media_type: 'video', platform: 'tiktok', page_name: 'Competitor C' },
      { id: 'cc-2', ad_text: 'Before and After Transformation', media_type: 'video', platform: 'tiktok', page_name: 'Competitor C' },
      { id: 'cc-3', ad_text: 'Unboxing This Amazing Product', media_type: 'video', platform: 'tiktok', page_name: 'Competitor C' },
      { id: 'cc-4', ad_text: '5 Reasons to Switch Today', media_type: 'video', platform: 'tiktok', page_name: 'Competitor C' },
      { id: 'cc-5', ad_text: 'Flash Sale — 60% OFF', media_type: 'video', platform: 'tiktok', page_name: 'Competitor C' },
      { id: 'cc-6', ad_text: 'Real Customer Review', media_type: 'video', platform: 'tiktok', page_name: 'Competitor C' },
      { id: 'cc-7', ad_text: 'How It Works in 30 Seconds', media_type: 'video', platform: 'tiktok', page_name: 'Competitor C' },
      { id: 'cc-8', ad_text: 'Dont Miss This Deal', media_type: 'video', platform: 'tiktok', page_name: 'Competitor C' },
    ],
  }), 'auto');
  seededCompetitors++;
    console.log(`Seeded demo data: ${seededCampaigns} campaigns, ${seededAds} ads, ${seededLps} landing pages, ${seededPas} platform accounts, ${seededPh} performance history rows, 15 templates, 2 users, ${seededDrafts} drafts, ${seededAbTests} ab tests, ${seededWidgets} widgets, ${seededCompetitors} competitors`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Seed data error (rolled back):', err.message);
  }
}
