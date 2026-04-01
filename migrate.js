const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigrations() {
  try {
    // Initialize SQLite first if PostgreSQL isn't available
    await db.initSQLite();
    await db.initSQLiteTables();

    const migrationsDir = path.join(__dirname, 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found, skipping.');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      // Check if already applied
      const check = await db.query(
        'SELECT id FROM migrations WHERE name = $1',
        [file]
      );

      if (check.rows.length > 0) {
        console.log(`Skipping migration (already applied): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      try {
        await db.execSQLite(sql);
        await db.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [file]
        );
        console.log(`Applied migration: ${file}`);
      } catch (err) {
        console.error(`Failed to apply migration ${file}:`, err.message);
        throw err;
      }
    }

    console.log('Migrations completed');
  } catch (err) {
    console.error('Migration error (continuing):', err.message);
  }
}

module.exports = { runMigrations };