import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';

const secret = config.jwtSecret;
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
  return jwt.verify(token, secret);
}
