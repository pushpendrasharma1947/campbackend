const express = require('express');
const router = express.Router();
const db = require('../db');
const { randomUUID } = require('crypto');
const path = require('path');
const multer = require('multer');
const auth = require('../middleware/auth');

// Uploads configuration
const uploadDir = path.join(__dirname, '..', 'uploads');
const fs = require("fs");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const basename = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, '_');
    cb(null, `${Date.now()}-${basename}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png)$/i;
  if (allowed.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, jpeg, png) are allowed')); 
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// POST /api/items
// Create new item listing (authenticated user becomes seller)
router.post('/', auth, upload.single('image'), async (req, res) => {
  const { title, description, price, category, condition } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const parsedPrice = Number(price);

  // Validation
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Title is required and must be a non-empty string' });
  }
  if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ error: 'Price is required and must be a non-negative number' });
  }

  // Ensure user is authenticated
  if (!req.user || !req.user.id) {
    console.error('User not authenticated or user.id missing:', req.user);
    return res.status(401).json({ error: 'User authentication failed' });
  }

  const id = randomUUID();
  const sellerId = req.user.id;

  try {
    const query = `
      INSERT INTO items (id, title, description, price, category, condition, seller_id, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, title, description, price, category, condition, seller_id, image_url, created_at
    `;
    const values = [
      id,
      title.trim(),
      description?.trim() || null,
      Math.floor(parsedPrice),
      category?.trim() || null,
      condition?.trim() || null,
      sellerId,
      imageUrl,
    ];

    const result = await db.query(query, values);
    const item = result.rows[0];

    res.status(201).json({
      item: {
        id: item.id,
        title: item.title,
        description: item.description,
        price: item.price,
        category: item.category,
        condition: item.condition,
        image_url: item.image_url,
        image: item.image_url,
        sellerId: item.seller_id,
        createdAt: item.created_at,
      }
    });
  } catch (err) {
    console.error('Failed to create item:', err.message);
    return res.status(500).json({ error: 'Failed to create item' });
  }
});

// GET /api/items
// Return marketplace items with optional filtering
router.get('/', async (req, res) => {
  const { search, category, min_price, max_price } = req.query;

  try {
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(i.title LIKE $${paramIndex} OR i.description LIKE $${paramIndex})`);
      values.push(`%${search.trim()}%`);
      paramIndex += 1;
    }

    if (category) {
      conditions.push(`i.category = $${paramIndex}`);
      values.push(category.trim());
      paramIndex += 1;
    }

    if (min_price !== undefined && min_price !== "") {
      const asNumber = Number(min_price);
      if (!Number.isNaN(asNumber)) {
        conditions.push(`i.price >= $${paramIndex}`);
        values.push(asNumber);
        paramIndex += 1;
      }
    }

    if (max_price !== undefined && max_price !== "") {
      const asNumber = Number(max_price);
      if (!Number.isNaN(asNumber)) {
        conditions.push(`i.price <= $${paramIndex}`);
        values.push(asNumber);
        paramIndex += 1;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT i.id, i.title, i.description, i.price, i.category, i.condition, i.image_url, i.seller_id, i.created_at,
             u.name as seller_name, u.email as seller_email
      FROM items i
      LEFT JOIN users u ON i.seller_id = u.id
      ${whereClause}
      ORDER BY i.created_at DESC
    `;

    const result = await db.query(query, values);
    const items = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      price: row.price,
      category: row.category,
      condition: row.condition,
      image_url: row.image_url,
      image: row.image_url,
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      sellerEmail: row.seller_email,
      createdAt: row.created_at
    }));

    res.json({ items });
  } catch (err) {
    console.error('Failed to fetch items:', err.message);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// GET /api/items/:id
// Return single item
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT i.id, i.title, i.description, i.price, i.category, i.condition, i.image_url, i.seller_id, i.created_at,
             u.name as seller_name, u.email as seller_email
      FROM items i
      JOIN users u ON i.seller_id = u.id
      WHERE i.id = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const row = result.rows[0];
    const item = {
      id: row.id,
      title: row.title,
      description: row.description,
      price: row.price,
      category: row.category,
      condition: row.condition,
      image_url: row.image_url,
      image: row.image_url,
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      sellerEmail: row.seller_email,
      createdAt: row.created_at
    };

    res.json({ item });
  } catch (err) {
    console.error('Failed to fetch item:', err.message);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// PATCH /api/items/:id
// Allow seller to update their item
router.patch('/:id', auth, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { title, description, price, category, condition } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
  const sellerId = req.user.id;

  const parsedPrice = price !== undefined ? Number(price) : undefined;

  // Validation
  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
    return res.status(400).json({ error: 'Title must be a non-empty string' });
  }
  if (price !== undefined && (Number.isNaN(parsedPrice) || parsedPrice < 0)) {
    return res.status(400).json({ error: 'Price must be a non-negative number' });
  }

  try {
    // First check if item exists and belongs to user
    const checkQuery = 'SELECT seller_id FROM items WHERE id = $1';
    const checkResult = await db.query(checkQuery, [id]);

    if (checkResult.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (checkResult.rows[0].seller_id !== sellerId) {
      return res.status(403).json({ error: 'Forbidden: You can only update your own items' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title.trim());
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description?.trim() || null);
    }
    if (price !== undefined) {
      updates.push(`price = $${paramIndex++}`);
      values.push(Math.floor(parsedPrice));
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(category?.trim() || null);
    }
    if (condition !== undefined) {
      updates.push(`condition = $${paramIndex++}`);
      values.push(condition?.trim() || null);
    }

    if (imageUrl !== undefined) {
      updates.push(`image_url = $${paramIndex++}`);
      values.push(imageUrl);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const updateQuery = `
      UPDATE items
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, title, description, price, category, condition, image_url, seller_id, created_at
    `;
    values.push(id);

    const result = await db.query(updateQuery, values);
    const item = result.rows[0];

    res.json({
      item: {
        id: item.id,
        title: item.title,
        description: item.description,
        price: item.price,
        category: item.category,
        condition: item.condition,
        image_url: item.image_url,
        sellerId: item.seller_id,
        createdAt: item.created_at
      }
    });
  } catch (err) {
    console.error('Failed to update item:', err.message);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/items/:id
// Allow seller to delete their item
router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const sellerId = req.user.id;

  try {
    // First check if item exists and belongs to user
    const checkQuery = 'SELECT seller_id FROM items WHERE id = $1';
    const checkResult = await db.query(checkQuery, [id]);

    if (checkResult.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (checkResult.rows[0].seller_id !== sellerId) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own items' });
    }

    // Delete the item
    await db.query('DELETE FROM items WHERE id = $1', [id]);

    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    console.error('Failed to delete item:', err.message);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;