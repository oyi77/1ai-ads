import { describe, it, expect } from 'vitest';
import { renderLandingPage, templates } from '../../../server/services/templates.js';

describe('renderLandingPage', () => {
  const baseData = {
    product_name: 'Test Product',
    theme: 'dark',
    price: 'Rp 500.000',
    pain_points: ['Slow delivery', 'High cost'],
    benefits: ['Fast shipping', 'Low price'],
    cta_primary: 'Buy Now',
    cta_secondary: 'Chat Us',
    wa_link: 'https://wa.me/628123456789',
    checkout_link: 'https://checkout.example.com',
  };

  it('renders valid HTML with all sections', () => {
    const html = renderLandingPage(baseData);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Test Product');
    expect(html).toContain('Rp 500.000');
    expect(html).toContain('Buy Now');
  });

  it('escapes product_name containing script tags', () => {
    const html = renderLandingPage({
      ...baseData,
      product_name: '<script>alert("xss")</script>',
    });
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes benefits array items containing HTML', () => {
    const html = renderLandingPage({
      ...baseData,
      benefits: ['<img onerror="alert(1)" src=x>', 'Normal benefit'],
    });
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img onerror');
  });

  it('escapes pain_points array items containing HTML', () => {
    const html = renderLandingPage({
      ...baseData,
      pain_points: ['<div onload="evil()">bad</div>'],
    });
    expect(html).not.toContain('<div onload');
    expect(html).toContain('&lt;div onload');
  });

  it('escapes cta_primary containing HTML', () => {
    const html = renderLandingPage({
      ...baseData,
      cta_primary: '"><script>alert(1)</script>',
    });
    expect(html).not.toContain('"><script>');
  });

  it('rejects javascript: protocol in checkout_link', () => {
    const html = renderLandingPage({
      ...baseData,
      checkout_link: 'javascript:alert(document.cookie)',
    });
    expect(html).not.toContain('javascript:');
  });

  it('rejects javascript: protocol in wa_link', () => {
    const html = renderLandingPage({
      ...baseData,
      wa_link: 'javascript:alert(1)',
    });
    expect(html).not.toContain('javascript:');
  });

  it('handles string JSON for benefits and pain_points', () => {
    const html = renderLandingPage({
      ...baseData,
      benefits: '["Benefit 1","Benefit 2"]',
      pain_points: '["Pain 1"]',
    });
    expect(html).toContain('Benefit 1');
    expect(html).toContain('Pain 1');
  });

  it('handles malformed JSON for benefits gracefully', () => {
    const html = renderLandingPage({
      ...baseData,
      benefits: 'not valid json',
      pain_points: 'also bad',
    });
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('defaults to dark theme for unknown theme', () => {
    const html = renderLandingPage({
      ...baseData,
      theme: 'nonexistent',
    });
    expect(html).toContain(templates.dark.colors.bg);
  });
});
