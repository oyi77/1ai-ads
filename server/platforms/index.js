/**
 * Platform Registry — auto-discovered from manifest.js files in each
 * platform service directory.
 *
 * Adding a new platform:
 *   1. Create server/services/<platform>/manifest.js with default export
 *   2. Create server/services/<platform>/index.js with the API class
 *   That's it. Routes, config, and frontend all derive from the manifest.
 *
 * Usage:
 *   import { getPlatform, listPlatforms } from './platforms/index.js';
 *   const meta = getPlatform('meta', settingsRepo);
 *   const campaigns = await meta.getCampaigns();
 */

import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validatePlatform } from '../lib/platform-interface.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICES_DIR = join(__dirname, '..', 'services');

// Auto-discover all platforms by scanning for manifest.js files.
const discovered = {};
for (const dir of readdirSync(SERVICES_DIR)) {
  const manifestPath = join(SERVICES_DIR, dir, 'manifest.js');
  try {
    const { default: manifest } = await import(manifestPath);
    discovered[manifest.key] = { ...manifest, service: `../services/${dir}/index.js` };
  } catch {
    // Not a platform plugin — skip
  }
}

export const PLATFORM_REGISTRY = discovered;

// Lazily-loaded map of platform key → class constructor.
// Populated on first access so top-level await doesn't block module evaluation.
let _PLATFORM_MAP = null;

async function loadPlatformMap() {
  if (_PLATFORM_MAP) return _PLATFORM_MAP;
  const map = {};
  const entries = Object.entries(PLATFORM_REGISTRY);
  const mods = await Promise.all(entries.map(([, cfg]) => import(cfg.service)));
  for (let i = 0; i < entries.length; i++) {
    map[entries[i][0]] = mods[i][entries[i][1].className];
  }
  _PLATFORM_MAP = map;
  return map;
}

/**
 * Get a platform API client instance.
 * @param {string} platform — registry key (e.g. 'meta', 'google')
 * @param {object} settingsRepo — credential/settings repository
 * @returns {Promise<import('../services/lib/base-platform-api.js').default>}
 */
export async function getPlatform(platform, settingsRepo) {
  const map = await loadPlatformMap();
  const PlatformClass = map[platform];
  if (!PlatformClass) {
    throw new Error(`Unknown platform: ${platform}`);
  }
  const instance = new PlatformClass(settingsRepo);
  validatePlatform(instance);
  return instance;
}

/**
 * Synchronous access after the map has been loaded.
 * Throws if called before loadPlatformMap() has resolved.
 */
export function getPlatformSync(platform, settingsRepo) {
  if (!_PLATFORM_MAP) {
    throw new Error('Platform map not loaded. Call getPlatform() or loadPlatforms() first.');
  }
  const PlatformClass = _PLATFORM_MAP[platform];
  if (!PlatformClass) {
    throw new Error(`Unknown platform: ${platform}`);
  }
  const instance = new PlatformClass(settingsRepo);
  validatePlatform(instance);
  return instance;
}

/**
 * Pre-load all platform modules. Call once at startup.
 */
export async function loadPlatforms() {
  await loadPlatformMap();
}

/**
 * List all available platform names.
 * @returns {string[]}
 */
export function listPlatforms() {
  return Object.keys(PLATFORM_REGISTRY);
}

/**
 * Get all platform clients for a given settings repo.
 * @param {object} settingsRepo
 * @returns {Promise<Object<string, BasePlatformApiClient>>}
 */
export async function getAllPlatforms(settingsRepo) {
  const map = await loadPlatformMap();
  const result = {};
  for (const name of Object.keys(map)) {
    result[name] = await getPlatform(name, settingsRepo);
  }
  return result;
}

/**
 * Get registry entry for a platform key.
 * @param {string} key
 * @returns {object|undefined}
 */
export function getPlatformConfig(key) {
  return PLATFORM_REGISTRY[key];
}

/**
 * List all registered platform keys.
 * @returns {string[]}
 */
export function listPlatformKeys() {
  return Object.keys(PLATFORM_REGISTRY);
}

