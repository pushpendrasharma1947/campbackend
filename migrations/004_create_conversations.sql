CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY,
  name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_activity TEXT
);
