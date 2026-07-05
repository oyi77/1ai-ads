/**
 * TargetingService — generates audience targeting suggestions based on
 * post category heuristics and engagement pattern analysis.
 */

/** Category → targeting heuristics (Indonesia-focused) */
const CATEGORY_HEURISTICS = {
  fashion: {
    age_min: 18, age_max: 35, genders: 'F',
    interests: ['fashion', 'shopping', 'beauty'],
    locations: ['Indonesia'],
    confidence_score: 0.85,
  },
  desain: {
    age_min: 18, age_max: 35, genders: 'F',
    interests: ['fashion', 'shopping', 'beauty'],
    locations: ['Indonesia'],
    confidence_score: 0.80,
  },
  food: {
    age_min: 18, age_max: 45, genders: 'ALL',
    interests: ['food', 'cooking', 'recipes'],
    locations: ['Indonesia'],
    confidence_score: 0.85,
  },
  kuliner: {
    age_min: 18, age_max: 45, genders: 'ALL',
    interests: ['food', 'cooking', 'recipes'],
    locations: ['Indonesia'],
    confidence_score: 0.85,
  },
  tech: {
    age_min: 18, age_max: 40, genders: 'M',
    interests: ['technology', 'gadgets', 'electronics'],
    locations: ['Indonesia'],
    confidence_score: 0.80,
  },
  gadget: {
    age_min: 18, age_max: 40, genders: 'M',
    interests: ['technology', 'gadgets', 'electronics'],
    locations: ['Indonesia'],
    confidence_score: 0.80,
  },
};

const DEFAULT_HEURISTIC = {
  age_min: 18, age_max: 45, genders: 'ALL',
  interests: ['shopping', 'trending'],
  locations: ['Indonesia'],
  confidence_score: 0.60,
};

export class TargetingService {
  /**
   * @param {import('../repositories/targeting-suggestions.js').TargetingSuggestionsRepository} targetingRepo
   * @param {import('../repositories/boost-recommendations.js').BoostRecommendationsRepository} boostRepo
   */
  constructor(targetingRepo, boostRepo) {
    this.targetingRepo = targetingRepo;
    this.boostRepo     = boostRepo;
  }

  /** Return heuristic for a category string, falling back to default. */
  _getHeuristic(category) {
    if (!category) return DEFAULT_HEURISTIC;
    const normalized = category.toLowerCase().trim();
    for (const [key, heuristic] of Object.entries(CATEGORY_HEURISTICS)) {
      if (normalized.includes(key) || key.includes(normalized)) return heuristic;
    }
    return DEFAULT_HEURISTIC;
  }

  /**
   * Generate and persist a targeting suggestion for a post.
   * Reads category from the boost_recommendations table if available.
   * @param {{ post_id: string, page_id: string, category?: string }} opts
   * @returns {object} targeting suggestion
   */
  suggest({ post_id, page_id, category = null }) {
    // Try to infer category from boost rec if not provided
    let resolvedCategory = category;
    if (!resolvedCategory) {
      const recs = this.boostRepo.findByStatus(null, { limit: 200 });
      const match = recs.find(r => r.post_id === post_id && r.page_id === page_id);
      if (match?.target_audience_json) {
        try {
          const ta = JSON.parse(match.target_audience_json);
          resolvedCategory = ta.category ?? null;
        } catch { /* ignore malformed JSON */ }
      }
    }

    const heuristic = this._getHeuristic(resolvedCategory);
    const suggestion = {
      post_id,
      page_id,
      category: resolvedCategory,
      ...heuristic,
    };

    return this.targetingRepo.upsert(suggestion);
  }

  /**
   * Return saved targeting for a post, or generate fresh if absent.
   * @param {string} post_id
   * @param {string} page_id
   */
  getOrSuggest(post_id, page_id) {
    const existing = this.targetingRepo.findByPost(post_id, page_id);
    if (existing) return existing;
    return this.suggest({ post_id, page_id });
  }

  /**
   * Analyze engagement patterns from boost recommendations grouped by category.
   * Returns aggregated avg score/budget per category.
   * @param {{ page_id?: string, days?: number }} opts
   */
  analyzeEngagementPatterns({ page_id = null, days = 30 } = {}) {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19);

    let recs = this.boostRepo.findByStatus(null, { limit: 1000 });

    // Filter by age and optionally page
    recs = recs.filter(r => r.created_at >= cutoff);
    if (page_id) recs = recs.filter(r => r.page_id === page_id);

    // Group by category derived from target_audience_json
    const groups = {};
    for (const r of recs) {
      let cat = 'unknown';
      if (r.target_audience_json) {
        try { cat = JSON.parse(r.target_audience_json)?.category ?? 'unknown'; } catch { /* ignore */ }
      }
      if (!groups[cat]) groups[cat] = { post_count: 0, score_sum: 0 };
      groups[cat].post_count++;
      groups[cat].score_sum += r.boost_score ?? 0;
    }

    const patterns = Object.entries(groups).map(([category, g]) => ({
      category,
      post_count: g.post_count,
      avg_boost_score: g.post_count > 0 ? Math.round((g.score_sum / g.post_count) * 1000) / 1000 : 0,
    })).sort((a, b) => b.avg_boost_score - a.avg_boost_score);

    return { patterns, days, page_id, total_categories: patterns.length };
  }

  /** List all saved targeting suggestions. */
  listAll(opts = {}) {
    return this.targetingRepo.findAll(opts);
  }
}
