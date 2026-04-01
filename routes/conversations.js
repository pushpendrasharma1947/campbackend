const express = require('express');
const router = express.Router();
const db = require('../db');
const { randomUUID } = require('crypto');
const auth = require('../middleware/auth');

// GET /api/conversations
// Returns a list of conversation ids with last activity and message count
router.get('/', auth, async (req, res) => {
  try{
    // List conversations from conversations table and include message counts
    const q = `
      SELECT c.id AS conversation_id, c.name AS conversation_name, c.last_activity AS last_at,
             c.owner_id, COALESCE(m.cnt, 0) AS message_count
      FROM conversations c
      LEFT JOIN (
        SELECT conversation_id, COUNT(*) AS cnt FROM messages GROUP BY conversation_id
      ) m ON m.conversation_id = c.id
      WHERE c.owner_id = $1
      ORDER BY c.last_activity DESC NULLS LAST
    `;
    const r = await db.query(q, [req.user.id]);
    const items = r.rows.map(row => ({
      conversationId: row.conversation_id,
      lastAt: row.last_at,
      messageCount: parseInt(row.message_count, 10),
      name: row.conversation_name || null,
      ownerId: row.owner_id
    }));
    res.json({ conversations: items });
  }catch(err){
    console.error('Failed to list conversations:', err.message);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// GET /api/conversations/:id
// Returns full message history for a conversation ordered by id (ascending)
router.get('/:id', auth, async (req, res) => {
  const id = req.params.id;
  try{
    // Ensure conversation belongs to user
    const meta = await db.query('SELECT id, name, owner_id FROM conversations WHERE id=$1', [id]);
    if(meta.rowCount === 0) return res.status(404).json({ error: 'Conversation not found' });
    const conv = meta.rows[0];
    if(conv.owner_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const r = await db.query(
      'SELECT id, role, content, created_at FROM messages WHERE conversation_id=$1 ORDER BY id ASC',
      [id]
    );
    const name = conv.name || null;
    res.json({ conversationId: id, messages: r.rows, name });
  }catch(err){
    console.error('Failed to fetch conversation:', err.message);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// PATCH /api/conversations/:id
// Body: { name: string }
router.patch('/:id', auth, async (req, res) => {
  const id = req.params.id;
  const name = req.body.name || null;
  try{
    // ensure ownership
    const meta = await db.query('SELECT owner_id FROM conversations WHERE id=$1', [id]);
    if(meta.rowCount === 0) return res.status(404).json({ error: 'Conversation not found' });
    if(meta.rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    // update conversations table and keep messages.conversation_name in sync
    await db.query('UPDATE conversations SET name=$1, last_activity = NOW() WHERE id=$2', [name, id]);
    await db.query('UPDATE messages SET conversation_name=$1 WHERE conversation_id=$2', [name, id]);
    res.json({ conversationId: id, name });
  }catch(err){
    console.error('Failed to rename conversation:', err.message);
    res.status(500).json({ error: 'Failed to rename conversation' });
  }
});

// DELETE /api/conversations/:id
// Deletes a conversation and its messages (ownership required)
router.delete('/:id', auth, async (req, res) => {
  const id = req.params.id;
  const client = await db.pool.connect();
  try{
    const meta = await client.query('SELECT owner_id FROM conversations WHERE id=$1', [id]);
    if(meta.rowCount === 0) return res.status(404).json({ error: 'Conversation not found' });
    if(meta.rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    await client.query('BEGIN');
    await client.query('DELETE FROM messages WHERE conversation_id=$1', [id]);
    await client.query('DELETE FROM conversations WHERE id=$1', [id]);
    await client.query('COMMIT');
    res.json({ conversationId: id, deleted: true });
  }catch(err){
    try{ await client.query('ROLLBACK'); }catch(e){}
    console.error('Failed to delete conversation:', err.message);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }finally{
    client.release();
  }
});

// POST /api/conversations
// Creates a new conversation and returns { conversationId, name }
router.post('/', auth, async (req, res) => {
  const name = req.body.name || null;
  // allow client-provided id (optional), otherwise generate server-side
  const id = req.body.id || randomUUID();
  const ownerId = req.user && req.user.id;
  try{
    await db.query('INSERT INTO conversations(id, name, owner_id, created_at, last_activity) VALUES($1, $2, $3, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, last_activity = EXCLUDED.last_activity, owner_id = COALESCE(conversations.owner_id, EXCLUDED.owner_id)', [id, name, ownerId]);
    res.status(201).json({ conversationId: id, name });
  }catch(err){
    console.error('Failed to create conversation:', err.message);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

module.exports = router;
