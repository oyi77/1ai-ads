export function seedTemplates(db) {
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
      hook_template: '✨ Introducing: {product_name}! ✨ Be the first to experience exclusive early-bird access.',
      body_template: '🎉 Join the waitlist · {reward_1} early access for VIPs 🎉\n🎉 {reward_2} Get exclusive discounts when you invite friends.',
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
      hook_template: '🚀 {brand_name} Launch Day! 🚀\n\nBe the first to experience {product_name}.\n\nEarly bird pricing for first {early_bird_count} users!',
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
      body_template: 'Shop the {season} collection before it\'s gone.\n\nGet notified for restock → Get VIP early access.',
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
      design_config: JSON.stringify({ style: 'professional', color: '#0891e2' })
    },

    // Tech/SaaS templates
    {
      id: 'tpl_feature_announce',
      category: 'saas',
      name: 'Feature Announcement',
      description: 'Announce new product features or updates',
      hook_template: '🚀 New Feature! 🚀\n\n{feature_name} is now LIVE!\n\n✨ {benefit_1} - {benefit_2} - {benefit_3}\n\nEarly adopters get {early_bird_discount}!\n\n📞 Update now → See what\'s new',
      body_template: 'Discover the power of {feature_name}.\n\nStreamline your workflow.',
      cta_template: 'Try for Free → Upgrade to Pro',
      design_config: JSON.stringify({ style: 'modern', color: '#6366f1' })
    },
    {
      id: 'tpl_beta_invite',
      category: 'saas',
      name: 'Beta Program Invite',
      description: 'Invite users to join beta testing program',
      hook_template: '🔬 Be a beta tester! 🔬\n\nGet early access to {feature_name} before anyone else.\n\nShape the future with your feedback.\n\nLimited spots - Join waitlist.',
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
      design_config: JSON.stringify({ style: 'academic', color: '#05966e' })
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
      INSERT OR IGNORE INTO templates (id, category, name, description,
        hook_template, body_template, cta_template,
        design_config, thumbnail_url, industry, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      tpl.id,
      tpl.category,
      tpl.name,
      tpl.description,
      tpl.hook_template,
      tpl.body_template,
      tpl.cta_template,
      JSON.stringify(tpl.design_config),
      '',
      tpl.industry || ''
    );
  });

  console.log(`Seeded ${templates.length} templates`);
}

export function seedDemoData(db) {
  seedTemplates(db);
}
