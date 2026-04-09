import { Router } from 'express';
import { hashPassword, verifyPassword, generateToken, generateRefreshToken, verifyToken } from '../lib/auth.js';
import rateLimit from 'express-rate-limit';

export function createAuthRouter(usersRepo, refreshTokensRepo) {
  const router = Router();

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.use(authLimiter);

   router.post('/register', async (req, res) => {
     try {
       const { username, password, email } = req.body;
       if (!username || !password || !email) {
         return res.status(400).json({ success: false, error: 'username, password, and email are required' });
       }

       if (password.length < 6) {
         return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
       }

       if (usersRepo.findByUsername(username)) {
         return res.status(409).json({ success: false, error: 'Username already exists' });
       }

       const userId = usersRepo.create({
         username,
         email,
         password_hash: hashPassword(password),
         confirmed: 1
       });

       const accessToken = generateToken({ id: userId, username, role: 'user', plan: 'free' });
       const refreshToken = generateRefreshToken({ id: userId, username });
       
       const expiresAt = new Date();
       expiresAt.setDate(expiresAt.getDate() + 30);
       refreshTokensRepo.create(userId, refreshToken, expiresAt.toISOString());

       res.json({
         success: true,
         data: {
           user: { id: userId, username, email, role: 'user', plan: 'free' },
           accessToken,
           refreshToken
         }
       });
     } catch (err) {
       res.status(500).json({ success: false, error: err.message });
     }
   });

   router.post('/login', async (req, res) => {
     try {
       const { username, password } = req.body;
       const user = usersRepo.findByUsername(username) || usersRepo.findByEmail(username);

       if (!user || !verifyPassword(password, user.password_hash)) {
         return res.status(401).json({ success: false, error: 'Invalid credentials' });
       }

       // Remove any existing refresh tokens for this user to prevent UNIQUE constraint conflicts
       refreshTokensRepo.deleteByUserId(user.id);

       const accessToken = generateToken({ id: user.id, username: user.username, role: user.role || 'user', plan: user.plan || 'free' });
       const refreshToken = generateRefreshToken({ id: user.id, username: user.username });

       const expiresAt = new Date();
       expiresAt.setDate(expiresAt.getDate() + 30);
       refreshTokensRepo.create(user.id, refreshToken, expiresAt.toISOString());

       res.json({
         success: true,
         data: {
           user: { id: user.id, username: user.username, email: user.email, role: user.role || 'user', plan: user.plan || 'free' },
           accessToken,
           refreshToken
         }
       });
     } catch (err) {
       res.status(500).json({ success: false, error: err.message });
     }
   });

  router.post('/refresh-token', async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ success: false, error: 'Refresh token required' });

      const payload = verifyToken(refreshToken);
      if (!payload || payload.tokenType !== 'refresh') {
        return res.status(401).json({ success: false, error: 'Invalid refresh token' });
      }

      const storedToken = refreshTokensRepo.findByToken(refreshToken);
      if (!storedToken) {
        return res.status(401).json({ success: false, error: 'Token not found or revoked' });
      }

      if (new Date(storedToken.expires_at) < new Date()) {
        refreshTokensRepo.deleteByToken(refreshToken);
        return res.status(401).json({ success: false, error: 'Refresh token expired' });
      }

      const user = usersRepo.findById(payload.id);
      if (!user) return res.status(401).json({ success: false, error: 'User not found' });

      // Rotate token
      const newAccessToken = generateToken({ id: user.id, username: user.username, role: user.role || 'user', plan: user.plan || 'free' });
      const newRefreshToken = generateRefreshToken({ id: user.id, username: user.username });

      refreshTokensRepo.deleteByToken(refreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      refreshTokensRepo.create(user.id, newRefreshToken, expiresAt.toISOString());

      res.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken
        }
      });
    } catch (err) {
      res.status(401).json({ success: false, error: 'Authentication failed' });
    }
  });

  router.post('/logout', (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) refreshTokensRepo.deleteByToken(refreshToken);
    res.json({ success: true });
  });

  return router;
}