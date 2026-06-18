const pLimit = require('p-limit');
const apiFootballClient = require('./apiFootballClient');
const config = require('./config');
const cache = require('./fixtureStatsCache');

/**
 * Pulls a single numeric stat value out of a fixture-statistics
 * "statistics" array, e.g. finds { type: "Yellow Cards", value: 5 }.
 * API-Football sometimes returns null for missing data (e.g. lower
 * leagues), so we default to 0 rather than letting NaN leak into sums.
 */
function extractStat(statisticsArray, typeName) {
  const entry = statisticsArray.find((s) => s.type === typeName);
  const value = entry ? entry.value : 0;
  return typeof value === 'number' ? value : 0;
}

/**
 * Fetches every fixture for La Liga 2024, then fetches per-fixture
 * statistics (bounded concurrency), and aggregates yellow cards,
 * corners, and matches played per team.
 *
 * Returns { teamTotals, failedFixtureIds } where teamTotals is a Map
 * keyed by teamId -> { teamName, yellowCards, corners, matchesPlayed, matchesWithStats }
 */
async function buildTeamAggregates() {
  const fixtures = await apiFootballClient.getFixtures(
    config.laLiga.leagueId,
    config.laLiga.season
  );

  // Only count fixtures that have actually been played — stats don't
  // exist yet for scheduled/future matches, and including them would
  // silently skew "matches played" if the API ever returns a status
  // we don't expect.
  const playedFixtures = fixtures.filter(
    (f) => f.fixture.status.short === 'FT'
  );

  const cachedCount = cache.count();
  console.log(
    `${playedFixtures.length} played fixtures found. ${cachedCount} fixture-statistics responses already cached on disk.`
  );

  const limit = pLimit(config.statsConcurrency);
  const teamTotals = new Map();
  const failedFixtureIds = [];

  function ensureTeam(teamId, teamName) {
    if (!teamTotals.has(teamId)) {
      teamTotals.set(teamId, {
        teamId,
        teamName,
        yellowCards: 0,
        corners: 0,
        matchesPlayed: 0,
        // matchesWithStats only counts fixtures where the statistics call
        // actually succeeded. This is what averages should divide by —
        // dividing by matchesPlayed when some fixtures failed would
        // silently understate the average (a failed fetch looks
        // identical to "0 cards that match" otherwise).
        matchesWithStats: 0,
      });
    }
    return teamTotals.get(teamId);
  }

  const tasks = playedFixtures.map((fixture) =>
    limit(async () => {
      const fixtureId = fixture.fixture.id;
      const homeTeam = fixture.teams.home;
      const awayTeam = fixture.teams.away;

      const home = ensureTeam(homeTeam.id, homeTeam.name);
      const away = ensureTeam(awayTeam.id, awayTeam.name);
      home.matchesPlayed += 1;
      away.matchesPlayed += 1;

      let statsResponse = cache.get(fixtureId);
      const wasCached = statsResponse !== null;

      if (!wasCached) {
        try {
          statsResponse = await apiFootballClient.getFixtureStatistics(fixtureId);
        } catch (err) {
          console.error(`Failed to fetch statistics for fixture ${fixtureId} after retries:`, err.message);
          failedFixtureIds.push(fixtureId);
          return; // matchesPlayed already counted; matchesWithStats stays as-is for both teams
        }
      }

      if (!statsResponse || statsResponse.length === 0) {
        // API returned 200 but no stats exist for this fixture (happens
        // occasionally even for finished matches). Treat the same as a
        // failure for averaging purposes rather than silently counting 0s.
        // Deliberately NOT cached — an empty result might just mean the
        // provider hasn't backfilled this fixture yet, so we want to
        // retry it on the next run rather than caching the gap forever.
        failedFixtureIds.push(fixtureId);
        return;
      }

      if (!wasCached) {
        cache.set(fixtureId, statsResponse);
      }

      home.matchesWithStats += 1;
      away.matchesWithStats += 1;

      for (const teamStats of statsResponse) {
        const teamId = teamStats.team.id;
        const target = ensureTeam(teamId, teamStats.team.name);
        target.yellowCards += extractStat(teamStats.statistics, 'Yellow Cards');
        target.corners += extractStat(teamStats.statistics, 'Corner Kicks');
      }
    })
  );

  await Promise.all(tasks);

  return { teamTotals, failedFixtureIds };
}

/**
 * Produces the two required leaderboards from the raw aggregates:
 *  - average yellow cards per team, descending (divided by matchesWithStats,
 *    i.e. only matches we actually have real data for)
 *  - total corners per team, descending
 */
function computeLeaderboards(teamTotals) {
  const teams = Array.from(teamTotals.values());

  const avgYellowCards = teams
    .map((t) => ({
      team: t.teamName,
      matchesPlayed: t.matchesPlayed,
      matchesWithStats: t.matchesWithStats,
      totalYellowCards: t.yellowCards,
      avgYellowCards: t.matchesWithStats > 0 ? t.yellowCards / t.matchesWithStats : 0,
    }))
    .sort((a, b) => b.avgYellowCards - a.avgYellowCards);

  const totalCorners = teams
    .map((t) => ({
      team: t.teamName,
      matchesPlayed: t.matchesPlayed,
      matchesWithStats: t.matchesWithStats,
      totalCorners: t.corners,
    }))
    .sort((a, b) => b.totalCorners - a.totalCorners);

  return { avgYellowCards, totalCorners };
}

async function getLaLigaStats() {
  const { teamTotals, failedFixtureIds } = await buildTeamAggregates();
  const leaderboards = computeLeaderboards(teamTotals);
  return {
    ...leaderboards,
    failedFixtureCount: failedFixtureIds.length,
    failedFixtureIds,
  };
}

module.exports = {
  getLaLigaStats,
  // exported for unit testing
  extractStat,
  computeLeaderboards,
};
