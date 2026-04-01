-- Add conversation_name column to messages to store a human-friendly name
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_name TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_conversation_name ON messages(conversation_id, conversation_name);
