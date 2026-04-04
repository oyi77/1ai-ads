/**
 * Competitor Spy Service
 *
 * Provides real‑world competitor information by fetching each competitor's
 * homepage and extracting basic metadata (title and description). The list of
 * competitors is taken from the environment variable `COMPETITOR_URLS`
 * (comma‑separated URLs). If the variable is missing, a built‑in fallback list
 * of well‑known sites is used.
 */

/**
 * Helper: fetch a URL and return its HTML text.
 */
async function fetchHtml(url) {
  try {
    const resp = await fetch(url, { timeout: 15000 }); // 15 s timeout
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } catch (e) {
    console.error(`Failed to fetch ${url}:`, e.message);
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
 */
export async function getCompetitorData() {
  // Load URLs from env or use a sane fallback.
  const envList = process.env.COMPETITOR_URLS;
  const fallback = [
    'https://www.google.com',
    'https://www.facebook.com',
    'https://www.amazon.com'
  ];
  const urls = envList ? envList.split(/\s*,\s*/) : fallback;

  const results = [];
  for (const url of urls) {
    const html = await fetchHtml(url);
    const meta = extractMeta(html);
    const hostname = (new URL(url)).hostname.replace('www.', '');
    results.push({
      name: meta.title || hostname,
      website: url,
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
  return results;
}
