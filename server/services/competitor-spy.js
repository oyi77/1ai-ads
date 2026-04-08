/**
 * Competitor Spy Service
 *
 * Provides real‑world competitor information by fetching each competitor's
 * homepage and extracting basic metadata (title and description). The list of
 * competitors is taken from the environment variable `COMPETITOR_URLS`
 * (comma‑separated URLs). If the variable is missing, a built‑in fallback list
 * of well‑known sites is used.
 */

import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('competitor-spy');

/**
 * Helper: fetch a URL and return its HTML text.
 */
async function fetchHtml(url) {
  try {
    const resp = await fetch(url, { timeout: 15000 }); // 15 s timeout
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } catch (e) {
    log.error(`Failed to fetch ${url}`, { message: e.message });
    return null;
  }
}

/**
 * Extract <title> and meta description from raw HTML.
 * Returns an object with `title` and `description` (both strings or empty).
 */
function extractMeta(html) {
  const result = { title: '', description: '' };
  if (!html) return result;
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) result.title = titleMatch[1].trim();
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  if (descMatch) result.description = descMatch[1].trim();
  return result;
}

/**
 * Returns an array of competitor objects with real data.
 * Each object contains:
 *   - `name`: extracted page title (fallback to hostname)
 *   - `website`: the URL
 *   - `description`: meta description (or empty string)
 *   - `features`: empty array (can be populated later)
 *
 * If a single URL is provided, fetches only that URL.
 * Otherwise, loads URLs from env or uses a sane fallback.
 */
export async function getCompetitorData(url) {
  let urls = [];

  if (url) {
    // Single URL provided
    urls = [url];
  } else {
    // Load URLs from env or use a sane fallback.
    const envList = config.competitorUrls;
    const fallback = [
      'https://www.google.com',
      'https://www.facebook.com',
      'https://www.amazon.com'
    ];
    urls = envList ? envList.split(/\s*,\s*/) : fallback;
  }

  const results = [];
  for (const u of urls) {
    const html = await fetchHtml(u);
    const meta = extractMeta(html);
    const hostname = (new URL(u)).hostname.replace('www.', '');
    results.push({
      name: meta.title || hostname,
      website: u,
      description: meta.description,
      features: []
    });
  }
  if (!results.length) {
    results.push({
      name: 'No competitor data available',
      website: '#',
      description: '',
      features: []
    });
  }
  return url ? results[0] : results;
}
