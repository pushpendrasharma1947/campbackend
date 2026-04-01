-- Add conversation_id to messages so we can store multiple conversations
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id TEXT DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
