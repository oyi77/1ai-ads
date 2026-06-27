import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';

// JWT secret must be provided via environment — no random fallback
// Tokens created with a random secret would be invalidated on every restart
const secret = config.jwtSecret || (() => {
  if (config.nodeEnv === 'test') {
    return 'test-secret-do-not-use-in-production';
  }
  throw new Error('FATAL: JWT_SECRET environment variable is required. Set it in .env before starting the server.');
})();
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 12);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function generateToken(payload, expiry = ACCESS_TOKEN_EXPIRY) {
  return jwt.sign(payload, secret, { expiresIn: expiry });
}

export function generateRefreshToken(payload) {
  return jwt.sign({ ...payload, tokenType: 'refresh' }, secret, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    }
    throw new Error('Invalid token');
  }
}
