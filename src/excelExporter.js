const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'la-liga-2024-stats.xlsx');

async function exportToExcel({ avgYellowCards, totalCorners, failedFixtureCount }) {
  const workbook = new ExcelJS.Workbook();

  const yellowSheet = workbook.addWorksheet('Avg Yellow Cards');
  yellowSheet.columns = [
    { header: 'Team', key: 'team', width: 28 },
    { header: 'Matches Played', key: 'matchesPlayed', width: 16 },
    { header: 'Matches w/ Stats', key: 'matchesWithStats', width: 16 },
    { header: 'Total Yellow Cards', key: 'totalYellowCards', width: 18 },
    { header: 'Avg Yellow Cards', key: 'avgYellowCards', width: 16 },
  ];
  avgYellowCards.forEach((row) => {
    yellowSheet.addRow({
      ...row,
      avgYellowCards: Number(row.avgYellowCards.toFixed(2)),
    });
  });
  yellowSheet.getRow(1).font = { bold: true };

  const cornersSheet = workbook.addWorksheet('Total Corners');
  cornersSheet.columns = [
    { header: 'Team', key: 'team', width: 28 },
    { header: 'Matches Played', key: 'matchesPlayed', width: 16 },
    { header: 'Matches w/ Stats', key: 'matchesWithStats', width: 16 },
    { header: 'Total Corners', key: 'totalCorners', width: 16 },
  ];
  totalCorners.forEach((row) => cornersSheet.addRow(row));
  cornersSheet.getRow(1).font = { bold: true };

  if (failedFixtureCount > 0) {
    [yellowSheet, cornersSheet].forEach((sheet) => {
      const noteRow = sheet.addRow([]);
      noteRow.getCell(1).value =
        `Note: ${failedFixtureCount} fixture(s) could not be fetched (e.g. rate limiting) and are excluded from these totals/averages.`;
      noteRow.getCell(1).font = { italic: true, color: { argb: 'FFB00000' } };
    });
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  await workbook.xlsx.writeFile(OUTPUT_PATH);
  return OUTPUT_PATH;
}

module.exports = { exportToExcel, OUTPUT_PATH };
