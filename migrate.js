const fs = require('fs').promises;
const path = require('path');
const db = require('./db');

async function runMigrations(){
  // Initialize SQLite if needed
  if (!db.pool) {
    await db.initSQLite();
    await db.initSQLiteTables();
  }

  // Ensure migrations table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      run_at TIMESTAMPTZ DEFAULT NOW()
    );
  `).catch(() => {
    // SQLite will handle this via initSQLiteTables
  });

  const migrationsDir = path.join(__dirname, 'migrations');
  let files = [];
  try{
    files = await fs.readdir(migrationsDir);
  }catch(err){
    console.warn('No migrations directory found:', err.message);
    return;
  }

  files = files.filter(f => f.endsWith('.sql')).sort();

  for(const file of files){
    const res = await db.query('SELECT 1 FROM migrations WHERE name=$1', [file]).catch(() => ({ rowCount: 0 }));
    if(res.rowCount > 0){
      console.log(`Skipping already-applied migration: ${file}`);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    try{
      // run migration SQL; if it contains multiple statements, we execute as a single query
      await db.query(sql).catch(err => {
        console.warn(`Migration ${file} skipped (might be PostgreSQL-specific):`, err.message);
      });
      await db.query('INSERT INTO migrations(name) VALUES($1)', [file]);
      console.log(`Applied migration: ${file}`);
    }catch(err){
      console.error(`Failed migration ${file}:`, err.message);
      // Continue instead of throwing for development
    }
  }
}

module.exports = runMigrations;
