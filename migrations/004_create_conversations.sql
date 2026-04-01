-- Create conversations table and migrate existing conversation ids/names
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ
);

-- Populate conversations from existing messages
INSERT INTO conversations(id, name, created_at, last_activity)
SELECT
  conversation_id AS id,
  MAX(conversation_name) AS name,
  MIN(created_at) AS created_at,
  MAX(created_at) AS last_activity
FROM messages
GROUP BY conversation_id
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  last_activity = EXCLUDED.last_activity;
