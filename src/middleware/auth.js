import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { audience: 'evently-admin' });

      // Get user from token
      const result = await pool.query(
        'SELECT id, email, username, role, is_active, created_at FROM users WHERE id = $1',
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      if (!result.rows[0].is_active) {
        return res.status(401).json({ message: 'Not authorized, user is inactive' });
      }
      req.user = result.rows[0];
      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as admin' });
  }
};

export const staff = (req, res, next) => {
  if (req.user && ['admin', 'staff'].includes(req.user.role)) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as staff' });
  }
};

export const protectGuest = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Guest session required' });
  }
  try {
    const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET, { audience: 'evently-guest' });
    if (decoded.type !== 'guest' || !decoded.guestId || !decoded.weddingId) throw new Error('Invalid guest session');
    req.guest = { id: decoded.guestId, weddingId: decoded.weddingId };
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Guest session expired or invalid' });
  }
};