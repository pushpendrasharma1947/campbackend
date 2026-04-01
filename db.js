const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const connectionString = process.env.DATABASE_URL;
let pool = null;
let sqliteDb = null;
let usingSQLite = false;

// Try PostgreSQL first, but don't fail
if (connectionString && connectionString.startsWith('postgres')) {
  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
}

// Initialize SQLite database as fallback
function initSQLite() {
  return new Promise((resolve) => {
    if (usingSQLite && sqliteDb) {
      resolve();
      return;
    }
    
    const dbPath = path.join(__dirname, 'campus_kart.db');
    sqliteDb = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('SQLite initialization error:', err.message);
      } else {
        console.log('Using SQLite database:', dbPath);
        usingSQLite = true;
        // Enable foreign keys
        sqliteDb.run('PRAGMA foreign_keys = ON');
      }
      resolve();
    });
  });
}

// Helper to run migrations on SQLite
async function initSQLiteTables() {
  if (!sqliteDb) return;
  
  const createTablesSQL = `
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      run_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category TEXT,
      condition TEXT,
      image_url TEXT,
      seller_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (seller_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `;

  return new Promise((resolve) => {
    sqliteDb.exec(createTablesSQL, (err) => {
      if (err) {
        console.error('Error creating SQLite tables:', err.message);
      } else {
        console.log('SQLite tables initialized');
      }
      resolve();
    });
  });
}

function querySQLite(text, params = []) {
  return new Promise((resolve, reject) => {
    // Convert PostgreSQL format ($1, $2) to SQLite format (?)
    const sqliteText = text.replace(/\$\d+/g, '?');
    
    // Handle INSERT...RETURNING
    if (sqliteText.trim().toUpperCase().includes('INSERT') && sqliteText.trim().toUpperCase().includes('RETURNING')) {
      const insertRegex = /INSERT\s+INTO\s+(\w+)\s*\((.*?)\)\s*VALUES\s*\((.*?)\)\s*RETURNING\s+(.*)/i;
      const match = sqliteText.match(insertRegex);
      
      if (match) {
        const tableName = match[1];
        const columns = match[2].split(',').map(c => c.trim());
        const returningColumns = match[4].split(',').map(c => c.trim());
        
        // Extract values clause for a simpler INSERT
        const simpleInsert = sqliteText.replace(/RETURNING\s+.*$/i, '').trim();
        
        sqliteDb.run(simpleInsert, params, function(err) {
          if (err) {
            console.error('SQLite insert error:', err.message);
            reject(err);
          } else {
            // Get the last inserted row
            const selectColumns = columns.length > 0 ? columns.join(', ') : '*';
            const selectQuery = `SELECT ${selectColumns} FROM ${tableName} ORDER BY rowid DESC LIMIT 1`;
            
            sqliteDb.all(selectQuery, [], (selectErr, rows) => {
              if (selectErr) {
                console.error('SQLite select error:', selectErr.message);
                reject(selectErr);
              } else {
                resolve({ rows: rows || [], rowCount: rows ? rows.length : 0 });
              }
            });
          }
        });
        return;
      }
    }
    
    if (sqliteText.trim().toUpperCase().startsWith('SELECT')) {
      sqliteDb.all(sqliteText, params, (err, rows) => {
        if (err) {
          console.error('SQLite query error:', err.message);
          reject(err);
        } else {
          // Return in PostgreSQL format for compatibility
          resolve({ rows: rows || [], rowCount: rows ? rows.length : 0 });
        }
      });
    } else {
      sqliteDb.run(sqliteText, params, function(err) {
        if (err) {
          console.error('SQLite exec error:', err.message);
          reject(err);
        } else {
          resolve({ rows: [], rowCount: this.changes });
        }
      });
    }
  });
}

// Query wrapper that works for both PostgreSQL and SQLite
async function query(text, params = []) {
  // If we're already using SQLite, use it directly
  if (usingSQLite && sqliteDb) {
    return querySQLite(text, params);
  }

  // Try PostgreSQL if available
  if (pool) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.error('PostgreSQL query error:', err.message);
      console.log('Falling back to SQLite...');
    }
  }

  // Fall back to SQLite
  if (!sqliteDb) {
    await initSQLite();
    await initSQLiteTables();
  }
  
  usingSQLite = true;
  return querySQLite(text, params);
}

module.exports = {
  query,
  pool,
  initSQLite,
  initSQLiteTables,
};
