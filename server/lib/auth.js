import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Generate random secret if none provided, but warn loudly
const secret = process.env.JWT_SECRET || (() => {
  console.error('[CRITICAL] JWT_SECRET not set! Using random fallback. Tokens will be invalid on restart. Set JWT_SECRET environment variable!');
  return crypto.randomBytes(64).toString('hex');
})();
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
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
