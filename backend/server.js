const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Ensure database directory exists for SQLite (when running locally)
if (!process.env.DATABASE_URL) {
  const dbDir = path.join(__dirname, '../database');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

// Use database loader - automatically selects PostgreSQL or SQLite
const db = require('./db-loader');

const authRoutes = require('./routes/auth');
const playersRoutes = require('./routes/players');
const tournamentsRoutes = require('./routes/tournaments');
const rankingsRoutes = require('./routes/rankings');
const calendarRoutes = require('./routes/calendar');
const clubsRoutes = require('./routes/clubs');
const backupRoutes = require('./routes/backup');
const inscriptionsRoutes = require('./routes/inscriptions');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('Railway deployment - using PORT:', PORT);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
// Check if frontend folder exists in current directory (Railway) or parent directory (local)
const frontendPath = fs.existsSync(path.join(__dirname, 'frontend'))
  ? path.join(__dirname, 'frontend')
  : path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/tournaments', tournamentsRoutes);
app.use('/api/rankings', rankingsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/clubs', clubsRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/inscriptions', inscriptionsRoutes);

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'login.html'));
});

// TEMPORARY: Data migration endpoint
app.get('/api/migrate-data', async (req, res) => {
  const { Pool } = require('pg');

  const SOURCE_DB = 'postgresql://postgres:tFNAQKoZUZmcQZqZpwOanqfXLZuTVKiE@yamabiko.proxy.rlwy.net:18777/railway';
  const TARGET_DB = process.env.DATABASE_URL;

  const sourcePool = new Pool({
    connectionString: SOURCE_DB,
    ssl: { rejectUnauthorized: false }
  });

  const targetPool = new Pool({
    connectionString: TARGET_DB,
    ssl: { rejectUnauthorized: false }
  });

  const results = [];

  async function migrateTable(tableName) {
    try {
      const sourceData = await sourcePool.query(`SELECT * FROM ${tableName}`);
      results.push(`${tableName}: found ${sourceData.rows.length} rows`);

      if (sourceData.rows.length === 0) return;

      await targetPool.query(`DELETE FROM ${tableName}`);

      let inserted = 0;
      for (const row of sourceData.rows) {
        const cols = Object.keys(row).filter(k => row[k] !== null);
        const vals = cols.map(k => row[k]);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');

        try {
          await targetPool.query(
            `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            vals
          );
          inserted++;
        } catch (err) {
          // Skip errors
        }
      }
      results.push(`${tableName}: migrated ${inserted} rows`);
    } catch (err) {
      results.push(`${tableName}: ERROR - ${err.message}`);
    }
  }

  try {
    await sourcePool.query('SELECT 1');
    results.push('Source connection: OK');
    await targetPool.query('SELECT 1');
    results.push('Target connection: OK');

    // Migrate in order
    await migrateTable('users');
    await migrateTable('categories');
    await migrateTable('players');
    await migrateTable('clubs');
    await migrateTable('tournaments');
    await migrateTable('tournament_results');
    await migrateTable('rankings');
    await migrateTable('calendar');
    await migrateTable('tournoi_ext');
    await migrateTable('inscriptions');

    // Reset sequences
    const sequences = ['users', 'categories', 'tournaments', 'tournament_results', 'rankings', 'clubs', 'calendar'];
    for (const table of sequences) {
      try {
        await targetPool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`);
      } catch (e) {}
    }
    results.push('Sequences reset');

    await sourcePool.end();
    await targetPool.end();

    res.json({ success: true, results });
  } catch (err) {
    res.json({ success: false, error: err.message, results });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let localIP = 'localhost';

  // Find the local network IP
  for (const interfaceName in networkInterfaces) {
    for (const iface of networkInterfaces[interfaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
  }

  console.log(`
╔════════════════════════════════════════════╗
║  French Billiard Ranking System           ║
║  Server running on:                       ║
║  - Local: http://localhost:${PORT}            ║
║  - Network: http://${localIP}:${PORT}${' '.repeat(Math.max(0, 10 - localIP.length))} ║
╚════════════════════════════════════════════╝
  `);
});

module.exports = app;
