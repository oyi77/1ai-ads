import { createLogger } from '../lib/logger.js';

const log = createLogger('image-generator');

const DEFAULT_DIMENSIONS = {
  meta: { width: 1080, height: 1080 },
  google: { width: 1200, height: 628 },
  tiktok: { width: 1080, height: 1920 },
  linkedin: { width: 1200, height: 627 },
  default: { width: 1080, height: 1080 },
};

const STYLE_PROMPTS = {
  clean: 'Clean, minimalist product photo on a white background, professional studio lighting, sharp focus',
  lifestyle: 'Lifestyle setting, natural lighting, model interacting with product, warm tones',
  urgent: 'Bold colors, urgent feel, sale graphics overlay, attention-grabbing composition',
  social_proof: 'Customer testimonial style, five-star elements, trust badges, before-and-after framing',
  bold: 'Bold, vibrant colors, dramatic lighting, high contrast, eye-catching',
  elegant: 'Elegant, premium feel, soft lighting, muted tones, luxury aesthetic',
};

export class ImageGenerator {
  /**
   * @param {Object} llmClient - LLMClient instance (expects optional generateImage method)
   */
  constructor(llmClient) {
    this.llm = llmClient;
  }

  /**
   * Generate an ad image from a product description.
   * @param {{ product: string, style?: string, platform?: string, dimensions?: { width: number, height: number } }} opts
   * @returns {Promise<{ imageUrl: string, prompt: string, dimensions: { width: number, height: number } }>}
   */
  async generateAdImage({ product, style = 'clean', platform = 'meta', dimensions } = {}) {
    if (!product) throw new Error('product description is required');

    const dims = dimensions || DEFAULT_DIMENSIONS[platform] || DEFAULT_DIMENSIONS.default;
    const styleHint = STYLE_PROMPTS[style] || STYLE_PROMPTS.clean;

    const prompt = [
      `Professional advertising image for: ${product}`,
      `Style: ${styleHint}`,
      `Dimensions: ${dims.width}x${dims.height}`,
      'High quality, ad-ready, no text overlay, suitable for paid social media advertising.',
    ].join('. ');

    log.info('generateAdImage', { product: product.slice(0, 50), style, platform });

    if (this.llm?.generateImage) {
      try {
        const result = await this.llm.generateImage({ prompt, width: dims.width, height: dims.height });
        return { imageUrl: result.url || result.imageUrl, prompt, dimensions: dims };
      } catch (err) {
        log.error('generateAdImage failed', { error: err.message });
        throw new Error(`Image generation failed: ${err.message}`);
      }
    }

    // Fallback: return prompt for manual use
    log.warn('generateAdImage: llm.generateImage not available, returning prompt only');
    return { imageUrl: null, prompt, dimensions: dims, fallback: true, message: 'Image generation API not configured. Use the prompt with an external tool.' };
  }

  /**
   * Generate multiple image variants for A/B testing.
   * @param {{ product: string, count?: number, styles?: string[], platform?: string }} opts
   * @returns {Promise<Array<{ imageUrl: string|null, style: string, prompt: string }>>}
   */
  async generateVariants({ product, count = 4, styles, platform = 'meta' } = {}) {
    if (!product) throw new Error('product description is required');

    const styleList = styles && styles.length
      ? styles.slice(0, count)
      : Object.keys(STYLE_PROMPTS).slice(0, count);

    const results = [];
    for (const style of styleList) {
      try {
        const variant = await this.generateAdImage({ product, style, platform });
        results.push({ ...variant, style });
      } catch (err) {
        log.warn('generateVariants: variant failed', { style, error: err.message });
        results.push({ imageUrl: null, style, prompt: null, error: err.message });
      }
    }

    return results;
  }

  /**
   * Remove background from an image.
   * @param {string} imageUrl
   * @returns {Promise<{ processedUrl: string }>}
   */
  async removeBackground(imageUrl) {
    if (!imageUrl) throw new Error('imageUrl is required');

    log.info('removeBackground', { imageUrl: imageUrl.slice(0, 80) });

    if (this.llm?.removeBackground) {
      try {
        const result = await this.llm.removeBackground(imageUrl);
        return { processedUrl: result.url || result.processedUrl };
      } catch (err) {
        log.error('removeBackground failed', { error: err.message });
        throw new Error(`Background removal failed: ${err.message}`);
      }
    }

    if (this.llm?.generateImage) {
      try {
        const result = await this.llm.generateImage({
          prompt: `Remove the background from this product image, keep the product intact with transparent/white background`,
          input: imageUrl,
          mode: 'edit',
        });
        return { processedUrl: result.url || result.imageUrl };
      } catch (err) {
        log.warn('removeBackground via generateImage failed', { error: err.message });
      }
    }

    log.warn('removeBackground: no suitable API available');
    return { processedUrl: imageUrl, fallback: true, message: 'Background removal API not configured.' };
  }
}
