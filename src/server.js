const express = require('express');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

app.use('/api/stats', statsRoutes);

app.get('/', (req, res) => {
  res.send('AffPapa La Liga Stats API. Try GET /api/stats/la-liga-2024?format=excel');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
