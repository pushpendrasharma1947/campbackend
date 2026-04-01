-- Add owner_id column to conversations and FK to users
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS owner_id TEXT;
ALTER TABLE conversations ADD CONSTRAINT fk_conversations_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_owner_id ON conversations(owner_id);
