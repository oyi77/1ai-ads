import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { ImageGenerator } from '../../../server/services/image-generator.js';

describe('ImageGenerator', () => {
  let generator;
  let mockLlm;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLlm = {
      generateImage: vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/img.png' }),
      removeBackground: vi.fn().mockResolvedValue({ processedUrl: 'https://cdn.example.com/img-nobg.png' }),
    };

    generator = new ImageGenerator(mockLlm);
  });

  it('should create instance with llm client', () => {
    expect(generator.llm).toBe(mockLlm);
  });

  describe('generateAdImage', () => {
    it('should generate image with default options', async () => {
      const result = await generator.generateAdImage({ product: 'Red sneakers' });
      expect(result.imageUrl).toBe('https://cdn.example.com/img.png');
      expect(result.prompt).toContain('Red sneakers');
      expect(result.dimensions).toEqual({ width: 1080, height: 1080 });
    });

    it('should use platform-specific dimensions', async () => {
      const result = await generator.generateAdImage({ product: 'Sneakers', platform: 'tiktok' });
      expect(result.dimensions).toEqual({ width: 1080, height: 1920 });
    });

    it('should use google dimensions', async () => {
      const result = await generator.generateAdImage({ product: 'Sneakers', platform: 'google' });
      expect(result.dimensions).toEqual({ width: 1200, height: 628 });
    });

    it('should use custom dimensions', async () => {
      const result = await generator.generateAdImage({
        product: 'Sneakers', dimensions: { width: 640, height: 480 },
      });
      expect(result.dimensions).toEqual({ width: 640, height: 480 });
    });

    it('should throw without product description', async () => {
      await expect(generator.generateAdImage({})).rejects.toThrow('product description is required');
    });

    it('should return fallback when llm has no generateImage', async () => {
      const gen = new ImageGenerator({});
      const result = await gen.generateAdImage({ product: 'Sneakers' });
      expect(result.imageUrl).toBeNull();
      expect(result.fallback).toBe(true);
    });

    it('should throw on API failure', async () => {
      mockLlm.generateImage.mockRejectedValue(new Error('API down'));
      await expect(generator.generateAdImage({ product: 'Sneakers' })).rejects.toThrow('Image generation failed');
    });
  });

  describe('generateVariants', () => {
    it('should generate multiple variants with default styles', async () => {
      const result = await generator.generateVariants({ product: 'Sneakers', count: 3 });
      expect(result).toHaveLength(3);
      expect(mockLlm.generateImage).toHaveBeenCalledTimes(3);
    });

    it('should use custom styles', async () => {
      const result = await generator.generateVariants({
        product: 'Sneakers', styles: ['bold', 'elegant'],
      });
      expect(result).toHaveLength(2);
      expect(result[0].style).toBe('bold');
      expect(result[1].style).toBe('elegant');
    });

    it('should throw without product', async () => {
      await expect(generator.generateVariants({})).rejects.toThrow('product description is required');
    });

    it('should handle partial failures gracefully', async () => {
      mockLlm.generateImage
        .mockResolvedValueOnce({ url: 'https://img1.png' })
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({ url: 'https://img3.png' });

      const result = await generator.generateVariants({ product: 'Sneakers', count: 3 });
      expect(result).toHaveLength(3);
      expect(result[0].imageUrl).toBe('https://img1.png');
      expect(result[1].error).toBeDefined();
      expect(result[2].imageUrl).toBe('https://img3.png');
    });
  });

  describe('removeBackground', () => {
    it('should remove background via dedicated API', async () => {
      const result = await generator.removeBackground('https://example.com/img.png');
      expect(result.processedUrl).toBe('https://cdn.example.com/img-nobg.png');
      expect(mockLlm.removeBackground).toHaveBeenCalledWith('https://example.com/img.png');
    });

    it('should throw without imageUrl', async () => {
      await expect(generator.removeBackground(null)).rejects.toThrow('imageUrl is required');
    });

    it('should fallback to generateImage if removeBackground unavailable', async () => {
      const gen = new ImageGenerator({ generateImage: mockLlm.generateImage });
      const result = await gen.removeBackground('https://example.com/img.png');
      expect(result.processedUrl).toBeDefined();
    });

    it('should return fallback when no API available', async () => {
      const gen = new ImageGenerator({});
      const result = await gen.removeBackground('https://example.com/img.png');
      expect(result.processedUrl).toBe('https://example.com/img.png');
      expect(result.fallback).toBe(true);
    });

    it('should throw on dedicated API failure', async () => {
      mockLlm.removeBackground.mockRejectedValue(new Error('API error'));
      await expect(generator.removeBackground('https://example.com/img.png')).rejects.toThrow('Background removal failed');
    });
  });
});
