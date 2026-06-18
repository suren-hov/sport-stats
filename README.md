# Test Task — La Liga 2024 Stats

Calculates, for every La Liga team in the 2024 season:
1. Average yellow cards per match (descending)
2. Total corners (descending)

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and put your real API-Football key in it:
   ```
   API_FOOTBALL_KEY=your_real_key_here
   ```
3. `npm start`

## Handling API rate limits

API-Football enforces a per-minute rate limit on every plan, not just a daily quota — free is 10 req/min, Pro is 300 req/min (5/sec), and other tiers sit in between. Fetching a full season's fixture statistics means ~380 individual requests, which can trip this even on a paid plan if fired too fast.

To handle this:
- `apiFootballClient.js` wraps every request in retry-with-exponential-backoff specifically for HTTP 429 responses (1s, 2s, 4s, 8s, 16s, up to 5 retries), and honors the `Retry-After` header if the API sends one.
- `statsConcurrency` (in `src/config.js`, overridable via `STATS_CONCURRENCY` env var) caps how many `/fixtures/statistics` calls run in parallel. Default is 3 — raise it if you know your plan's per-minute limit comfortably supports more.
- Fixtures whose statistics still fail to fetch after all retries (or return no data) are excluded from the averages rather than silently counted as zero. The response includes `failedFixtureCount` and `failedFixtureIds` so you can see if any data is missing. Averages are computed as `totalCards / matchesWithStats`, not `totalCards / matchesPlayed`, specifically so a handful of failed fetches don't quietly drag down a team's average.
- Every successful fixture-statistics response is cached to disk under `.cache/fixture-statistics/` (one JSON file per fixture ID). Re-running the app never re-fetches a fixture that already succeeded — it only spends quota on fixtures that previously failed or were never fetched. This matters a lot on a shared API key with a daily cap: a second run after hitting the daily limit will pick up exactly where it left off instead of starting over from zero. Delete `.cache/` if you ever want to force a full refetch.

## Usage

- `GET http://localhost:3000/api/stats/la-liga-2024` → JSON only
- `GET http://localhost:3000/api/stats/la-liga-2024?format=excel` → JSON + writes `output/la-liga-2024-stats.xlsx`

First call is slow (~380 fixture-statistics requests, rate-limited to 5 concurrent) — this is inherent to the API design, since there's no single "season stats" endpoint; stats are only available per-fixture.

## Architecture

- `src/config.js` — env vars + constants (league id, season, concurrency limit)
- `src/apiFootballClient.js` — thin HTTP wrapper, the only file aware of API-Football's URL/response shape
- `src/statsService.js` — fetch fixtures, fan out to fixture-statistics (bounded concurrency), aggregate per team, compute + sort leaderboards
- `src/excelExporter.js` — builds the .xlsx workbook from computed leaderboards
- `src/routes/stats.js` + `src/server.js` — thin Express HTTP layer

## Notes

- Only fixtures with status `FT` (full time / played) are counted.
- Missing/null statistic values from the API default to 0 rather than crashing.
- API key is never logged or committed (see `.gitignore`).

curl -s -H "x-apisports-key: API_KEY" https://v3.football.api-sports.io/status
