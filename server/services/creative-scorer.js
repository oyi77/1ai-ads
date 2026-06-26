import { createLogger } from '../lib/logger.js';

const log = createLogger('creative-scorer');

/**
 * 14-dimension feature vector for creative quality prediction.
 * Each feature is normalised to [0, 1].
 */
export const FEATURE_NAMES = [
  'hook_length',        // 0  - normalised word count of hook
  'hook_has_number',    // 1  - hook contains a digit
  'hook_has_question',  // 2  - hook contains '?'
  'hook_has_urgency',   // 3  - urgency words (now, today, limited, hurry, last, final)
  'hook_has_curiosity', // 4  - curiosity triggers (secret, surprising, unknown, hidden)
  'hook_has_social',    // 5  - social proof (10k, trusted, award, #1, best)
  'hook_has_pain',      // 6  - pain words (tired, struggling, frustrated, stop, hate)
  'body_length',        // 7  - normalised word count of body
  'body_has_number',    // 8  - body contains specific numbers/percentages
  'body_has_benefit',   // 9  - benefit words (save, free, improve, boost, faster)
  'cta_strength',       // 10 - CTA word quality (get, start, try, shop, buy, claim)
  'cta_has_urgency',    // 11 - CTA urgency (now, today, today only)
  'platform_fit',       // 12 - length/platform appropriateness
  'complexity_score',   // 13 - inverse of avg word length (simpler = better)
];

const URGENCY_WORDS = ['now', 'today', 'limited', 'hurry', 'last', 'final', 'ending', 'deadline', 'fast', 'quick', 'instant', 'segera', 'hari ini', 'terbatas'];
const CURIOSITY_WORDS = ['secret', 'surprising', 'unknown', 'hidden', 'revealed', 'truth', 'myth', 'hack', 'trick', 'rahasia'];
const SOCIAL_WORDS = ['#1', 'best', 'award', 'trusted', 'proven', 'rated', 'recommended', 'terlaris', 'terpercaya'];
const PAIN_WORDS = ['tired', 'struggling', 'frustrated', 'stop', 'hate', 'sick', 'annoyed', 'worried', 'capek', 'bosan', 'masalah'];
const BENEFIT_WORDS = ['save', 'free', 'improve', 'boost', 'faster', 'better', 'easier', 'grow', 'increase', 'hemat', 'gratis', 'untung'];
const CTA_WORDS = ['get', 'start', 'try', 'shop', 'buy', 'claim', 'grab', 'discover', 'join', 'learn', 'order', 'beli', 'pesan', 'coba'];
const CTA_URGENCY = ['now', 'today', 'instant', 'immediately', 'sekarang', 'hari ini'];

// Default logistic regression weights (14 features + bias)
const DEFAULT_WEIGHTS = [
  0.12,   // hook_length
  0.35,   // hook_has_number
  0.28,   // hook_has_question
  0.45,   // hook_has_urgency
  0.40,   // hook_has_curiosity
  0.50,   // hook_has_social
  0.38,   // hook_has_pain
  0.08,   // body_length
  0.30,   // body_has_number
  0.42,   // body_has_benefit
  0.55,   // cta_strength
  0.35,   // cta_has_urgency
  0.20,   // platform_fit
  0.15,   // complexity_score
  -1.20,  // bias (intercept)
];

const LEARNING_RATE = 0.01;

export class CreativeScorer {
  /**
   * @param {Object} db - better-sqlite3 database instance
   * @param {Object} llmClient - LLMClient instance
   * @param {Object} settingsRepo - SettingsRepository (optional, for stored weights)
   */
  constructor(db, llmClient, settingsRepo) {
    this.db = db;
    this.llm = llmClient;
    this.settingsRepo = settingsRepo;

    // Load weights from settings or use defaults
    this.weights = this._loadWeights();
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Score a creative before launch (predictive).
   * @param {{ hook: string, body: string, cta?: string, imageUrl?: string, platform?: string }} creative
   * @returns {{ score: number, breakdown: Object, suggestions: string[], model: string, probability: number }}
   */
  async scoreCreative({ hook = '', body = '', cta = '', imageUrl, platform = 'meta' } = {}) {
    const features = this._extractFeatures({ hook, body, cta, platform });
    const logit = this._logisticLogit(features, this.weights);
    const probability = this._sigmoid(logit);
    const score = Math.round(probability * 100);

    const breakdown = {};
    for (let i = 0; i < FEATURE_NAMES.length; i++) {
      breakdown[FEATURE_NAMES[i]] = Math.round(features[i] * 100) / 100;
    }

    const suggestions = this._generateSuggestions({ hook, body, cta, features, score });

    return {
      score,
      breakdown,
      suggestions,
      model: 'logistic',
      probability: Math.round(probability * 1000) / 1000,
    };
  }

  /**
   * Score based on historical performance of similar creatives.
   * @param {{ product: string, platform?: string, hookStyle?: string }} opts
   * @returns {{ historicalScore: number, similarCreatives: Array }}
   */
  async scoreByHistory({ product, platform, hookStyle } = {}) {
    try {
      const rows = this.db.prepare(`
        SELECT * FROM creative_library
        WHERE (?1 IS NULL OR platform = ?1)
        ORDER BY performance_score DESC NULLS LAST
        LIMIT 20
      `).all(platform || null);

      if (!rows.length) {
        return { historicalScore: 50, similarCreatives: [], note: 'No historical data available.' };
      }

      const scores = rows.filter(r => r.performance_score != null).map(r => r.performance_score);
      const avgScore = scores.length
        ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
        : 50;

      return {
        historicalScore: avgScore,
        similarCreatives: rows.slice(0, 5).map(r => ({
          id: r.id,
          name: r.name,
          hook: r.hook,
          score: r.performance_score,
          bestRoas: r.best_roas,
          bestCtr: r.best_ctr,
        })),
      };
    } catch (err) {
      log.warn('scoreByHistory: query failed', { error: err.message });
      return { historicalScore: 50, similarCreatives: [], error: err.message };
    }
  }

  /**
   * Train the model from historical creative performance data.
   * Uses gradient descent on stored creatives with known outcomes.
   * @param {{ epochs?: number, learningRate?: number }} opts
   * @returns {{ epochs: number, finalLoss: number, weights: number[] }}
   */
  async trainFromHistory({ epochs = 100, learningRate = LEARNING_RATE } = {}) {
    let trainingData;

    try {
      trainingData = this.db.prepare(`
        SELECT hook, body, cta, platform, performance_score,
               COALESCE(best_ctr, 0) AS ctr, COALESCE(best_roas, 0) AS roas
        FROM creative_library
        WHERE performance_score IS NOT NULL
        LIMIT 1000
      `).all();
    } catch (err) {
      log.warn('trainFromHistory: no training data', { error: err.message });
      return { epochs: 0, finalLoss: 0, weights: [...this.weights] };
    }

    if (!trainingData.length) {
      return { epochs: 0, finalLoss: 0, weights: [...this.weights] };
    }

    // Convert performance_score to binary label (>= 60 = good)
    const samples = trainingData.map(d => ({
      features: this._extractFeatures({
        hook: d.hook || '', body: d.body || '', cta: d.cta || '', platform: d.platform || 'meta',
      }),
      label: (d.performance_score || 0) >= 60 ? 1 : 0,
    }));

    const w = [...this.weights];
    let finalLoss = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      const gradients = new Array(w.length).fill(0);

      for (const sample of samples) {
        const logit = this._logisticLogit(sample.features, w);
        const pred = this._sigmoid(logit);
        const error = pred - sample.label;

        // Accumulate gradients
        for (let j = 0; j < w.length - 1; j++) {
          gradients[j] += error * sample.features[j];
        }
        gradients[w.length - 1] += error; // bias term

        // Binary cross-entropy loss
        totalLoss -= sample.label * Math.log(pred + 1e-10) + (1 - sample.label) * Math.log(1 - pred + 1e-10);
      }

      // Update weights
      for (let j = 0; j < w.length; j++) {
        w[j] -= learningRate * (gradients[j] / samples.length);
      }

      finalLoss = totalLoss / samples.length;
    }

    this.weights = w;
    this._saveWeights();

    log.info('trainFromHistory complete', { samples: samples.length, epochs, finalLoss: Math.round(finalLoss * 1000) / 1000 });

    return { epochs, finalLoss: Math.round(finalLoss * 1000) / 1000, weights: [...w] };
  }

  // ── Feature Extraction ───────────────────────────────────────

  _extractFeatures({ hook, body, cta, platform }) {
    const hookLower = (hook || '').toLowerCase();
    const bodyLower = (body || '').toLowerCase();
    const ctaLower = (cta || '').toLowerCase();
    const hookWords = hookLower.split(/\s+/).filter(Boolean);
    const bodyWords = bodyLower.split(/\s+/).filter(Boolean);

    return [
      // 0: hook_length (normalised: 0 if empty, 1 if 15+ words)
      Math.min(hookWords.length / 15, 1),
      // 1: hook_has_number
      /\d/.test(hook) ? 1 : 0,
      // 2: hook_has_question
      hook.includes('?') ? 1 : 0,
      // 3: hook_has_urgency
      URGENCY_WORDS.some(w => hookLower.includes(w)) ? 1 : 0,
      // 4: hook_has_curiosity
      CURIOSITY_WORDS.some(w => hookLower.includes(w)) ? 1 : 0,
      // 5: hook_has_social
      SOCIAL_WORDS.some(w => hookLower.includes(w)) ? 1 : 0,
      // 6: hook_has_pain
      PAIN_WORDS.some(w => hookLower.includes(w)) ? 1 : 0,
      // 7: body_length (normalised: 0-1, cap at 50 words)
      Math.min(bodyWords.length / 50, 1),
      // 8: body_has_number
      /\d+%|\d+x|\d+\s*(ribu|jt|m|rb)/i.test(body) ? 1 : 0,
      // 9: body_has_benefit
      BENEFIT_WORDS.some(w => bodyLower.includes(w)) ? 1 : 0,
      // 10: cta_strength
      CTA_WORDS.some(w => ctaLower.includes(w)) ? 1 : 0,
      // 11: cta_has_urgency
      CTA_URGENCY.some(w => ctaLower.includes(w)) ? 1 : 0,
      // 12: platform_fit (ideal: meta 10-20 words hook, short body)
      this._platformFit(hookWords.length, bodyWords.length, platform),
      // 13: complexity_score (simpler words → higher score)
      this._complexityScore([...hookWords, ...bodyWords]),
    ];
  }

  _platformFit(hookLen, bodyLen, platform) {
    if (platform === 'meta' || platform === 'instagram') {
      // Meta: short hooks (5-15 words), body 10-40 words ideal
      const hookFit = hookLen >= 5 && hookLen <= 15 ? 1 : hookLen < 3 || hookLen > 25 ? 0.2 : 0.5;
      const bodyFit = bodyLen >= 10 && bodyLen <= 40 ? 1 : bodyLen < 5 ? 0.3 : 0.5;
      return (hookFit + bodyFit) / 2;
    }
    if (platform === 'tiktok') {
      // TikTok: very short hooks (3-10 words)
      return hookLen >= 3 && hookLen <= 10 ? 1 : 0.4;
    }
    if (platform === 'google') {
      // Google: structured, medium length
      return hookLen >= 3 && hookLen <= 15 ? 0.8 : 0.4;
    }
    return 0.5; // unknown platform
  }

  _complexityScore(words) {
    if (!words.length) return 0.5;
    const avgLen = words.reduce((s, w) => s + w.length, 0) / words.length;
    // Shorter words (avg 4-6 chars) score higher
    if (avgLen >= 3 && avgLen <= 6) return 1;
    if (avgLen < 3) return 0.6;
    if (avgLen <= 8) return 0.7;
    return 0.3;
  }

  // ── Logistic Regression ──────────────────────────────────────

  _sigmoid(z) {
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
  }

  _logisticLogit(features, weights) {
    let z = weights[weights.length - 1]; // bias
    for (let i = 0; i < features.length; i++) {
      z += features[i] * weights[i];
    }
    return z;
  }

  _logisticPredict(features, weights) {
    return this._sigmoid(this._logisticLogit(features, weights));
  }

  _hasAnySignal(text, wordList) {
    const lower = (text || '').toLowerCase();
    return wordList.some(w => lower.includes(w));
  }

  // ── Suggestions Generator ────────────────────────────────────

  _generateSuggestions({ hook, body, cta, features, score }) {
    const suggestions = [];

    if (score < 60) {
      if (!features[1]) suggestions.push('Add a specific number or statistic to your hook (e.g., "3x faster", "50% off").');
      if (!features[3]) suggestions.push('Add urgency language to your hook (e.g., "today only", "limited time").');
      if (!features[5]) suggestions.push('Include social proof in your hook (e.g., "trusted by 10K+ customers").');
    }

    if (score < 40) {
      if (!features[2]) suggestions.push('Consider using a question in your hook to spark curiosity.');
      if (!features[6]) suggestions.push('Address a pain point your audience relates to.');
    }

    if (!features[9]) suggestions.push('Highlight a clear benefit in your body text (e.g., "save time", "boost revenue").');
    if (!features[10]) suggestions.push('Strengthen your CTA with action verbs (e.g., "Get", "Start", "Try").');
    if (!features[11]) suggestions.push('Add urgency to your CTA (e.g., "Shop now", "Get started today").');

    if (features[0] > 0.9) suggestions.push('Your hook may be too long. Aim for 5-15 words for maximum impact.');
    if (features[0] < 0.15 && hook) suggestions.push('Your hook is very short. Consider adding more context or a compelling detail.');

    if (!suggestions.length && score >= 80) {
      suggestions.push('Great creative! Consider A/B testing slight variations to optimise further.');
    }

    return suggestions;
  }

  // ── Weight Persistence ───────────────────────────────────────

  _loadWeights() {
    try {
      const stored = this.settingsRepo?.get?.('creative_scorer_weights');
      if (stored) {
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
        if (Array.isArray(parsed) && parsed.length === FEATURE_NAMES.length + 1) {
          log.info('Loaded stored weights');
          return parsed;
        }
      }
    } catch { /* ignore, use defaults */ }
    return [...DEFAULT_WEIGHTS];
  }

  _saveWeights() {
    try {
      this.settingsRepo?.set?.('creative_scorer_weights', JSON.stringify(this.weights));
    } catch (err) {
      log.warn('_saveWeights failed', { error: err.message });
    }
  }
}
