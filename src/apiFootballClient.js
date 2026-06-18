const axios = require('axios');
const config = require('./config');

// A single configured axios instance. Every call to API-Football
// goes through this, so auth headers and base URL live in one place.
const client = axios.create({
  baseURL: config.apiFootball.baseUrl,
  headers: {
    'x-apisports-key': config.apiFootball.key,
  },
  timeout: 15000,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Tracks the most recent per-minute rate-limit headers we've seen, so we
// can proactively slow down BEFORE hitting a 429, not just react after.
// API-Football sends these on every response (success or failure):
//   X-RateLimit-Limit       - max calls allowed per minute
//   X-RateLimit-Remaining   - calls left in the current minute window
let lastKnownLimit = null;
let lastKnownRemaining = null;

function recordRateLimitHeaders(headers) {
  if (!headers) return;
  const limit = headers['x-ratelimit-limit'];
  const remaining = headers['x-ratelimit-remaining'];
  if (limit !== undefined) lastKnownLimit = Number(limit);
  if (remaining !== undefined) lastKnownRemaining = Number(remaining);
}

/**
 * If we're down to our last couple of per-minute requests, pause briefly
 * before firing the next one. This is what turns "react after a 429"
 * into "avoid most 429s in the first place."
 */
async function throttleIfNearLimit() {
  if (lastKnownRemaining !== null && lastKnownRemaining <= 1) {
    console.warn(
      `Only ${lastKnownRemaining}/${lastKnownLimit} per-minute requests left — pausing 3s before next call.`
    );
    await sleep(3000);
  }
}

/**
 * Wraps a request function with retry + exponential backoff specifically
 * for 429 (Too Many Requests) responses. API-Football enforces a
 * per-minute rate limit on every plan (even paid tiers, just with a
 * higher ceiling), so 429s are an expected, recoverable condition —
 * not a fatal error.
 *
 * If the response includes a `Retry-After` header (seconds), we honor
 * it. Otherwise we fall back to exponential backoff with jitter.
 */
async function withRetry(requestFn, { maxRetries = 3 } = {}) {
  let attempt = 0;

  while (true) {
    await throttleIfNearLimit();

    try {
      const response = await requestFn();
      recordRateLimitHeaders(response.headers);
      return response;
    } catch (err) {
      const status = err.response?.status;
      const isRateLimited = status === 429;
      const isOutOfRetries = attempt >= maxRetries;

      recordRateLimitHeaders(err.response?.headers);

      if (!isRateLimited || isOutOfRetries) {
        if (isRateLimited) {
          // We're giving up on this fixture — log the full error body so
          // we can tell a per-minute limit apart from a daily-quota wall
          // or an IP-sharing throttle (API-Football's error message text
          // differs for each, see err.response.data).
          console.error('Final 429 details:', JSON.stringify(err.response?.data));
        }
        throw err;
      }

      const retryAfterHeader = err.response?.headers?.['retry-after'];
      const retryAfterMs = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : null;

      // Exponential backoff with jitter as a fallback: 1s, 2s, 4s, 8s, 16s (+ up to 300ms jitter)
      const backoffMs = retryAfterMs ?? (2 ** attempt) * 1000 + Math.random() * 300;

      console.warn(
        `Rate limited (429, ${lastKnownRemaining}/${lastKnownLimit} per-min remaining). ` +
        `Retrying in ${Math.round(backoffMs)}ms (attempt ${attempt + 1}/${maxRetries})...`
      );
      await sleep(backoffMs);
      attempt += 1;
    }
  }
}

/**
 * Fetch all fixtures for a given league + season.
 * Docs: GET /fixtures?league={id}&season={year}
 * Returns the raw `response` array from API-Football (one entry per match).
 */
async function getFixtures(leagueId, season) {
  const { data } = await withRetry(() =>
    client.get('/fixtures', { params: { league: leagueId, season } })
  );
  return data.response;
}

/**
 * Fetch the statistics for a single fixture.
 * Docs: GET /fixtures/statistics?fixture={id}
 * Returns an array of two objects: [{ team, statistics: [...] }, { team, statistics: [...] }]
 * one for the home team, one for the away team.
 */
async function getFixtureStatistics(fixtureId) {
  const { data } = await withRetry(() =>
    client.get('/fixtures/statistics', { params: { fixture: fixtureId } })
  );
  return data.response;
}

module.exports = {
  getFixtures,
  getFixtureStatistics,
};
