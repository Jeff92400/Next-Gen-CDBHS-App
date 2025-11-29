const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

// SQLite source database
const sqliteDb = new sqlite3.Database('../database/billard.db');

// PostgreSQL target database (Railway)
// IMPORTANT: Use environment variable instead of hardcoding credentials
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:PASSWORD@host:5432/database',
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('Starting migration from SQLite to PostgreSQL...\n');

  try {
    // Get SQLite data
    const players = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM players', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const tournaments = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM tournaments', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const tournamentResults = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM tournament_results', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const rankings = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM rankings', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    console.log(`Found:`);
    console.log(`  - ${players.length} players`);
    console.log(`  - ${tournaments.length} tournaments`);
    console.log(`  - ${tournamentResults.length} tournament results`);
    console.log(`  - ${rankings.length} rankings\n`);

    // Migrate players
    console.log('Migrating players...');
    for (const player of players) {
      await pgPool.query(
        `INSERT INTO players (licence, club, first_name, last_name, rank_libre, rank_cadre, rank_bande, rank_3bandes, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (licence) DO UPDATE SET
           club = $2, first_name = $3, last_name = $4, rank_libre = $5, rank_cadre = $6, rank_bande = $7, rank_3bandes = $8, is_active = $9`,
        [player.licence, player.club, player.first_name, player.last_name, player.rank_libre,
         player.rank_cadre, player.rank_bande, player.rank_3bandes, player.is_active, player.created_at]
      );
    }
    console.log(`✅ Migrated ${players.length} players\n`);

    // Migrate tournaments
    console.log('Migrating tournaments...');
    for (const tournament of tournaments) {
      await pgPool.query(
        `INSERT INTO tournaments (id, category_id, tournament_number, season, import_date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (category_id, tournament_number, season) DO UPDATE SET
           import_date = $5`,
        [tournament.id, tournament.category_id, tournament.tournament_number, tournament.season, tournament.import_date]
      );
    }
    console.log(`✅ Migrated ${tournaments.length} tournaments\n`);

    // Migrate tournament results
    console.log('Migrating tournament results...');
    for (const result of tournamentResults) {
      await pgPool.query(
        `INSERT INTO tournament_results (id, tournament_id, licence, player_name, match_points, moyenne, serie)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tournament_id, licence) DO UPDATE SET
           player_name = $4, match_points = $5, moyenne = $6, serie = $7`,
        [result.id, result.tournament_id, result.licence, result.player_name, result.match_points, result.moyenne, result.serie]
      );
    }
    console.log(`✅ Migrated ${tournamentResults.length} tournament results\n`);

    // Migrate rankings
    if (rankings.length > 0) {
      console.log('Migrating rankings...');
      for (const ranking of rankings) {
        await pgPool.query(
          `INSERT INTO rankings (category_id, season, licence, total_match_points, avg_moyenne, best_serie, rank_position, tournament_1_points, tournament_2_points, tournament_3_points, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (category_id, season, licence) DO UPDATE SET
             total_match_points = $4, avg_moyenne = $5, best_serie = $6, rank_position = $7,
             tournament_1_points = $8, tournament_2_points = $9, tournament_3_points = $10, updated_at = $11`,
          [ranking.category_id, ranking.season, ranking.licence, ranking.total_match_points,
           ranking.avg_moyenne, ranking.best_serie, ranking.rank_position, ranking.tournament_1_points,
           ranking.tournament_2_points, ranking.tournament_3_points, ranking.updated_at]
        );
      }
      console.log(`✅ Migrated ${rankings.length} rankings\n`);
    }

    console.log('🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }
}

migrate();
