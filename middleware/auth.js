const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function authMiddleware(req, res, next){
  const auth = req.headers.authorization;
  console.log('Auth header:', auth);
  if(!auth || !auth.startsWith('Bearer ')) {
    console.log('Missing or invalid auth header');
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
  const token = auth.slice(7);
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    console.log('Token verified, user:', payload);
    req.user = payload; // payload should include id and email
    return next();
  }catch(err){
    console.error('Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = authMiddleware;
