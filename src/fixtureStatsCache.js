const fs = require('fs');
const path = require('path');

// Each fixture's successful statistics response gets written to disk here,
// one JSON file per fixture. This means a second run (e.g. tomorrow, once
// the daily quota resets) never re-requests a fixture we already have —
// it only fills the gaps left by failedFixtureIds from a previous run.
// On API-Football's Pro plan, the season's ~380 statistics requests are a
// meaningful chunk of the 7500/day budget, especially on a key shared with
// other people, so avoiding repeat calls is worth the disk-cache complexity.
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'fixture-statistics');

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(fixtureId) {
  return path.join(CACHE_DIR, `${fixtureId}.json`);
}

/**
 * Returns the cached statistics response for a fixture, or null if not cached.
 */
function get(fixtureId) {
  try {
    const raw = fs.readFileSync(cachePath(fixtureId), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    // A corrupted cache file shouldn't crash the whole run — treat it as
    // a cache miss and let the real API call overwrite it.
    console.warn(`Cache file for fixture ${fixtureId} unreadable, refetching:`, err.message);
    return null;
  }
}

/**
 * Persists a fixture's statistics response to disk.
 */
function set(fixtureId, statsResponse) {
  ensureCacheDir();
  fs.writeFileSync(cachePath(fixtureId), JSON.stringify(statsResponse), 'utf8');
}

/**
 * Returns how many fixtures currently have a cached response, useful for
 * logging progress (e.g. "247/380 already cached, fetching the rest").
 */
function count() {
  try {
    return fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).length;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

module.exports = { get, set, count, CACHE_DIR };
