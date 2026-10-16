import jwt from 'jsonwebtoken';
import { config } from '../config/envConfig.js';

/**
 * Middleware to verify JWT session token.
 * Extracted payload (userId, mobileNumber, role) is attached to the request object.
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No session token provided.' });
  }

  try {
    const verified = jwt.verify(token, config.jwtSecret);
    req.user = verified;
    next();
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return res.status(403).json({ error: 'Invalid or expired session token.' });
  }
}

export default authenticateToken;
