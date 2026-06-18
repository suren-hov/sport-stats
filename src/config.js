require('dotenv').config();

const config = {
  apiFootball: {
    baseUrl: 'https://v3.football.api-sports.io',
    key: process.env.API_FOOTBALL_KEY,
  },
  laLiga: {
    leagueId: 140, // La Liga's league id in API-Football
    season: 2024,
  },
  // How many concurrent requests we allow when hitting /fixtures/statistics.
  // API-Football enforces a per-minute cap on every plan (free: 10/min,
  // Pro: 300/min or 5/sec). In practice, on a key SHARED with other users
  // (as this one is), effective capacity can be much lower because the
  // provider may also rate-limit by source IP, and other people's traffic
  // on the same key counts against the same per-minute bucket. We default
  // conservatively to 2 and rely on apiFootballClient's retry/backoff and
  // proactive header-based throttling as the real safety net. Override via
  // STATS_CONCURRENCY env var once you've confirmed your effective limit.
  statsConcurrency: Number(process.env.STATS_CONCURRENCY) || 2,
  // How many internal retry passes getLaLigaStats makes over failed
  // fixtures before giving up, and how long to pause between passes.
  // This is what lets a SINGLE request finish the whole season in one
  // go instead of you manually re-running the server multiple times.
  statsMaxPasses: Number(process.env.STATS_MAX_PASSES) || 6,
  statsCooldownMs: Number(process.env.STATS_COOLDOWN_MS) || 20000,
};

if (!config.apiFootball.key) {
  throw new Error(
    'Missing API_FOOTBALL_KEY. Create a .env file (see .env.example) and set it there.'
  );
}

module.exports = config;