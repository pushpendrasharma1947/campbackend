require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const chatRouter = require('./routes/chat');
const convRouter = require('./routes/conversations');
const authRouter = require('./routes/auth');
const itemsRouter = require('./routes/items');
const { runMigrations } = require('./migrate'); // ✅ fixed
const db = require('./db');
const app = express();

// Security middleware
app.use(helmet());

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// General rate limiter (100 requests per 15 minutes per IP)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for auth routes (5 requests per 15 minutes per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/chat', generalLimiter, chatRouter);
app.use('/api/conversations', generalLimiter, convRouter);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/items', generalLimiter, itemsRouter);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'error', 
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 4000;

(async function start() {
  try {
    await runMigrations();
    console.log('Migrations completed');
  } catch (err) {
    console.error('Migration error (continuing):', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
})();