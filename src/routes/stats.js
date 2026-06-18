const express = require('express');
const statsService = require('../statsService');
const excelExporter = require('../excelExporter');

const router = express.Router();

/**
 * GET /api/stats/la-liga-2024
 * Optional query param: ?format=excel to also (re)generate the .xlsx file.
 *
 * Returns JSON with both leaderboards. This can take a while on first
 * call since it fans out to ~380 fixture-statistics requests.
 */
router.get('/la-liga-2024', async (req, res) => {
  try {
    const stats = await statsService.getLaLigaStats();

    let excelPath = null;
    if (req.query.format === 'excel') {
      excelPath = await excelExporter.exportToExcel(stats);
    }

    res.json({
      league: 'La Liga',
      season: 2024,
      excelFile: excelPath,
      ...stats,
    });
  } catch (err) {
    console.error('Failed to compute La Liga stats:', err);
    res.status(500).json({ error: 'Failed to compute stats', details: err.message });
  }
});

module.exports = router;
