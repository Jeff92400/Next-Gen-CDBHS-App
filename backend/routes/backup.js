const express = require('express');
const ExcelJS = require('exceljs');
const { authenticateToken } = require('./auth');
const db = require('../db-loader');

const router = express.Router();

// Export all players to Excel
router.get('/export-players', authenticateToken, async (req, res) => {
  try {
    db.all('SELECT * FROM players ORDER BY last_name, first_name', [], async (err, players) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Joueurs');

      // Add headers
      worksheet.columns = [
        { header: 'Licence', key: 'licence', width: 15 },
        { header: 'Prénom', key: 'first_name', width: 20 },
        { header: 'Nom', key: 'last_name', width: 20 },
        { header: 'Club', key: 'club', width: 30 },
        { header: 'Rang Libre', key: 'rank_libre', width: 15 },
        { header: 'Rang Cadre', key: 'rank_cadre', width: 15 },
        { header: 'Rang Bande', key: 'rank_bande', width: 15 },
        { header: 'Rang 3 Bandes', key: 'rank_3bandes', width: 15 },
        { header: 'Actif', key: 'is_active', width: 10 }
      ];

      // Style headers
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4788' }
      };
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Add data
      players.forEach(player => {
        worksheet.addRow({
          licence: player.licence,
          first_name: player.first_name,
          last_name: player.last_name,
          club: player.club,
          rank_libre: player.rank_libre,
          rank_cadre: player.rank_cadre,
          rank_bande: player.rank_bande,
          rank_3bandes: player.rank_3bandes,
          is_active: player.is_active ? 'Oui' : 'Non'
        });
      });

      // Generate filename with date
      const filename = `Joueurs_Backup_${new Date().toISOString().split('T')[0]}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      await workbook.xlsx.write(res);
      res.end();
    });
  } catch (error) {
    console.error('Error exporting players:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export all tournaments and results to Excel
router.get('/export-tournaments', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT
        t.id,
        t.tournament_number,
        t.season,
        t.import_date,
        c.game_type,
        c.level,
        c.display_name as category
      FROM tournaments t
      JOIN categories c ON t.category_id = c.id
      ORDER BY t.season DESC, c.game_type, c.level, t.tournament_number
    `;

    db.all(query, [], async (err, tournaments) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const workbook = new ExcelJS.Workbook();

      // Sheet 1: Tournaments
      const tournamentsSheet = workbook.addWorksheet('Tournois');
      tournamentsSheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Catégorie', key: 'category', width: 30 },
        { header: 'Saison', key: 'season', width: 15 },
        { header: 'Numéro', key: 'tournament_number', width: 10 },
        { header: 'Date Import', key: 'import_date', width: 20 }
      ];

      tournamentsSheet.getRow(1).font = { bold: true };
      tournamentsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4788' }
      };
      tournamentsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      tournaments.forEach(t => {
        tournamentsSheet.addRow(t);
      });

      // Sheet 2: Tournament Results
      db.all(`
        SELECT
          tr.id,
          t.season,
          c.display_name as category,
          t.tournament_number,
          tr.licence,
          tr.player_name,
          tr.match_points,
          tr.moyenne,
          tr.serie
        FROM tournament_results tr
        JOIN tournaments t ON tr.tournament_id = t.id
        JOIN categories c ON t.category_id = c.id
        ORDER BY t.season DESC, c.display_name, t.tournament_number, tr.match_points DESC
      `, [], async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const resultsSheet = workbook.addWorksheet('Résultats');
        resultsSheet.columns = [
          { header: 'Saison', key: 'season', width: 15 },
          { header: 'Catégorie', key: 'category', width: 30 },
          { header: 'Tournoi', key: 'tournament_number', width: 10 },
          { header: 'Licence', key: 'licence', width: 15 },
          { header: 'Joueur', key: 'player_name', width: 25 },
          { header: 'Points Match', key: 'match_points', width: 15 },
          { header: 'Moyenne', key: 'moyenne', width: 12 },
          { header: 'Série', key: 'serie', width: 10 }
        ];

        resultsSheet.getRow(1).font = { bold: true };
        resultsSheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1F4788' }
        };
        resultsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

        results.forEach(r => {
          resultsSheet.addRow(r);
        });

        const filename = `Tournois_Backup_${new Date().toISOString().split('T')[0]}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await workbook.xlsx.write(res);
        res.end();
      });
    });
  } catch (error) {
    console.error('Error exporting tournaments:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export all rankings to Excel
router.get('/export-rankings', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT
        r.season,
        c.display_name as category,
        r.licence,
        p.first_name,
        p.last_name,
        p.club,
        r.rank_position,
        r.total_match_points,
        r.avg_moyenne,
        r.best_serie,
        r.tournament_1_points,
        r.tournament_2_points,
        r.tournament_3_points
      FROM rankings r
      JOIN categories c ON r.category_id = c.id
      JOIN players p ON r.licence = p.licence
      ORDER BY r.season DESC, c.display_name, r.rank_position
    `;

    db.all(query, [], async (err, rankings) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Classements');

      worksheet.columns = [
        { header: 'Saison', key: 'season', width: 15 },
        { header: 'Catégorie', key: 'category', width: 30 },
        { header: 'Position', key: 'rank_position', width: 10 },
        { header: 'Licence', key: 'licence', width: 15 },
        { header: 'Prénom', key: 'first_name', width: 20 },
        { header: 'Nom', key: 'last_name', width: 20 },
        { header: 'Club', key: 'club', width: 30 },
        { header: 'Total Points', key: 'total_match_points', width: 12 },
        { header: 'Moyenne', key: 'avg_moyenne', width: 12 },
        { header: 'Meilleure Série', key: 'best_serie', width: 15 },
        { header: 'Points T1', key: 'tournament_1_points', width: 12 },
        { header: 'Points T2', key: 'tournament_2_points', width: 12 },
        { header: 'Points T3', key: 'tournament_3_points', width: 12 }
      ];

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4788' }
      };
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      rankings.forEach(r => {
        worksheet.addRow(r);
      });

      const filename = `Classements_Backup_${new Date().toISOString().split('T')[0]}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      await workbook.xlsx.write(res);
      res.end();
    });
  } catch (error) {
    console.error('Error exporting rankings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export complete database backup
router.get('/export-all', authenticateToken, async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();

    // Export Players
    await new Promise((resolve, reject) => {
      db.all('SELECT * FROM players ORDER BY last_name, first_name', [], (err, players) => {
        if (err) return reject(err);

        const sheet = workbook.addWorksheet('Joueurs');
        sheet.columns = [
          { header: 'Licence', key: 'licence', width: 15 },
          { header: 'Prénom', key: 'first_name', width: 20 },
          { header: 'Nom', key: 'last_name', width: 20 },
          { header: 'Club', key: 'club', width: 30 },
          { header: 'Rang Libre', key: 'rank_libre', width: 15 },
          { header: 'Rang Cadre', key: 'rank_cadre', width: 15 },
          { header: 'Rang Bande', key: 'rank_bande', width: 15 },
          { header: 'Rang 3 Bandes', key: 'rank_3bandes', width: 15 },
          { header: 'Actif', key: 'is_active', width: 10 }
        ];

        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4788' } };

        players.forEach(p => {
          sheet.addRow({ ...p, is_active: p.is_active ? 'Oui' : 'Non' });
        });

        resolve();
      });
    });

    // Export Tournaments
    await new Promise((resolve, reject) => {
      db.all(`
        SELECT t.*, c.display_name as category
        FROM tournaments t
        JOIN categories c ON t.category_id = c.id
        ORDER BY t.season DESC, t.tournament_number
      `, [], (err, tournaments) => {
        if (err) return reject(err);

        const sheet = workbook.addWorksheet('Tournois');
        sheet.columns = [
          { header: 'ID', key: 'id', width: 10 },
          { header: 'Catégorie', key: 'category', width: 30 },
          { header: 'Saison', key: 'season', width: 15 },
          { header: 'Numéro', key: 'tournament_number', width: 10 },
          { header: 'Date Import', key: 'import_date', width: 20 }
        ];

        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4788' } };

        tournaments.forEach(t => sheet.addRow(t));
        resolve();
      });
    });

    // Export Tournament Results
    await new Promise((resolve, reject) => {
      db.all(`
        SELECT tr.*, t.season, c.display_name as category, t.tournament_number
        FROM tournament_results tr
        JOIN tournaments t ON tr.tournament_id = t.id
        JOIN categories c ON t.category_id = c.id
        ORDER BY t.season DESC, tr.match_points DESC
      `, [], (err, results) => {
        if (err) return reject(err);

        const sheet = workbook.addWorksheet('Résultats');
        sheet.columns = [
          { header: 'Saison', key: 'season', width: 15 },
          { header: 'Catégorie', key: 'category', width: 30 },
          { header: 'Tournoi', key: 'tournament_number', width: 10 },
          { header: 'Licence', key: 'licence', width: 15 },
          { header: 'Joueur', key: 'player_name', width: 25 },
          { header: 'Points Match', key: 'match_points', width: 15 },
          { header: 'Moyenne', key: 'moyenne', width: 12 },
          { header: 'Série', key: 'serie', width: 10 }
        ];

        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4788' } };

        results.forEach(r => sheet.addRow(r));
        resolve();
      });
    });

    // Export Rankings
    await new Promise((resolve, reject) => {
      db.all(`
        SELECT r.*, c.display_name as category, p.first_name, p.last_name, p.club
        FROM rankings r
        JOIN categories c ON r.category_id = c.id
        JOIN players p ON r.licence = p.licence
        ORDER BY r.season DESC, r.rank_position
      `, [], (err, rankings) => {
        if (err) return reject(err);

        const sheet = workbook.addWorksheet('Classements');
        sheet.columns = [
          { header: 'Saison', key: 'season', width: 15 },
          { header: 'Catégorie', key: 'category', width: 30 },
          { header: 'Position', key: 'rank_position', width: 10 },
          { header: 'Licence', key: 'licence', width: 15 },
          { header: 'Prénom', key: 'first_name', width: 20 },
          { header: 'Nom', key: 'last_name', width: 20 },
          { header: 'Club', key: 'club', width: 30 },
          { header: 'Total Points', key: 'total_match_points', width: 12 },
          { header: 'Moyenne', key: 'avg_moyenne', width: 12 },
          { header: 'Meilleure Série', key: 'best_serie', width: 15 }
        ];

        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4788' } };

        rankings.forEach(r => sheet.addRow(r));
        resolve();
      });
    });

    const filename = `Backup_Complet_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Error exporting complete backup:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
