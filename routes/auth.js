const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const TOKEN_EXP = process.env.JWT_EXP || '7d';

// POST /api/auth/register { name, email, password }
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if(!email || !password) return res.status(400).json({ error: 'email and password required' });
  try{
    const id = randomUUID();
    const hash = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users(id, name, email, password_hash) VALUES($1, $2, $3, $4)', [id, name || null, email, hash]);
    const token = jwt.sign({ id, email }, JWT_SECRET, { expiresIn: TOKEN_EXP });
    res.status(201).json({ token, user: { id, email, name } });
  }catch(err){
    console.error('Register failed', err.message);
    res.status(500).json({ error: 'Register failed' });
  }
});

// POST /api/auth/login { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if(!email || !password) return res.status(400).json({ error: 'email and password required' });
  try{
    const r = await db.query('SELECT id, password_hash, name FROM users WHERE email=$1', [email]);
    if(r.rowCount === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const row = r.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if(!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: row.id, email }, JWT_SECRET, { expiresIn: TOKEN_EXP });
    res.json({ token, user: { id: row.id, email, name: row.name } });
  }catch(err){
    console.error('Login failed', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
