const express = require('express');
const router = express.Router();
const db = require('../db');
const providers = require('../providers');
const auth = require('../middleware/auth');
const { randomUUID } = require('crypto');

// POST /api/chat
// Expects { message: string, conversationId?: string }
router.post('/', auth, async (req, res) => {
  const userMessage = req.body.message || '';
  let conversationId = req.body.conversationId || null;
  const ownerId = req.user && req.user.id;

  // If no conversationId provided, create one server-side
  if(!conversationId){
    conversationId = randomUUID();
    try{
      await db.query('INSERT INTO conversations(id, owner_id, created_at, last_activity) VALUES($1, $2, NOW(), NOW())', [conversationId, ownerId]);
    }catch(err){
      console.warn('Failed to create conversation:', err.message);
    }
  }

  // Ensure conversation exists and belongs to this user
  try{
    const meta = await db.query('SELECT owner_id FROM conversations WHERE id=$1', [conversationId]);
    if(meta.rowCount === 0){
      // create and associate
      await db.query('INSERT INTO conversations(id, owner_id, created_at, last_activity) VALUES($1, $2, NOW(), NOW())', [conversationId, ownerId]);
    }else if(meta.rows[0].owner_id && meta.rows[0].owner_id !== ownerId){
      return res.status(403).json({ error: 'Conversation belongs to another user' });
    }

    await db.query('INSERT INTO messages(role, content, conversation_id, conversation_name) VALUES($1, $2, $3, $4)', ['user', userMessage, conversationId, null]);
  }catch(err){
    console.warn('DB insert failed (continuing):', err.message);
  }

  // Load conversation history (ordered)
  let history = [];
  try{
    const r = await db.query(
      'SELECT role, content FROM messages WHERE conversation_id=$1 ORDER BY id ASC',
      [conversationId]
    );
    history = r.rows.map(row => ({ role: row.role, content: row.content }));
  }catch(err){
    console.warn('Failed to load conversation history:', err.message);
  }

  // Call provider with the role-based history
  let assistantText = '';
  try{
    assistantText = await providers.generateReply(history, { maxOutputTokens: 400 });
  }catch(err){
    console.error('AI provider error:', err.message);
    assistantText = `Error: AI provider failed to generate a response.`;
  }

  const assistant = { role: 'assistant', content: assistantText };

  // Save assistant reply with conversation id and update conversation last_activity
  try {
    await db.query('INSERT INTO messages(role, content, conversation_id, conversation_name) VALUES($1, $2, $3, $4)', ['assistant', assistant.content, conversationId, null]);
    await db.query('UPDATE conversations SET last_activity = NOW() WHERE id=$1', [conversationId]);
  } catch (err) {
    console.warn('DB insert failed (assistant):', err.message);
  }

  res.json({ reply: assistant, conversationId });
});

module.exports = router;
