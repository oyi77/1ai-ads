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

  // --- Facebook OAuth routes (public) ---
  router.get('/facebook/login', (req, res) => {
    const { redirect_uri } = req.query;
    const callbackUrl = redirect_uri || `${req.protocol}://${req.get('host')}/api/auth/facebook/callback`;
    
    const fbAppId = process.env.FB_APP_ID;
    const fbScope = 'ads_management,ads_read,pages_show_list,pages_read_engagement';
    const fbUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${encodeURIComponent(fbScope)}`;
    
    res.json({ success: true, data: { fb_url: fbUrl } });
  });

  router.get('/facebook/callback', async (req, res) => {
    const code = req.query.code;
    const redirect_uri = req.query.redirect_uri;
    
    if (!code) {
      return res.status(400).json({ success: false, error: 'Code parameter required' });
    }
    
    const fbAppId = process.env.FB_APP_ID;
    const fbSecret = process.env.FB_APP_SECRET;
    const callbackUrl = redirect_uri || `${req.protocol}://${req.get('host')}/api/auth/facebook/callback`;
    
    if (!fbAppId || !fbSecret) {
      return res.status(500).json({ success: false, error: 'FB_APP_ID or FB_APP_SECRET not configured' });
    }
    
    try {
      // Exchange code for access token
      const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token`;
      const tokenResponse = await fetch(`${tokenUrl}?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(callbackUrl)}&client_secret=${fbSecret}&code=${code}`);
      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        return res.status(400).json({ success: false, error: tokenData.error.message });
      }
      
      const accessToken = tokenData.access_token;
      const tokenExpires = tokenData.expires_in || 0;
      
      // Get user info
      const userResponse = await fetch(`https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name,email`);
      const userData = await userResponse.json();
      
      if (userData.error) {
        return res.status(400).json({ success: false, error: userData.error.message });
      }
      
      // Find or create user
      let user = usersRepo.findByEmail(userData.email);
      if (!user) {
        const userId = usersRepo.create({
          username: userData.name.replace(/\s+/g, '_').toLowerCase() || 'facebook_user',
          email: userData.email,
          password_hash: hashPassword(`fb_${Date.now()}`),
          confirmed: 1
        });
        user = usersRepo.findById(userId);
      }
      
      // Update user settings with Meta info
      const settingsRepo = req.app.locals.settingsRepo;
      if (settingsRepo) {
        settingsRepo.set(`meta_${user.id}_access_token`, accessToken);
        settingsRepo.set(`meta_${user.id}_expires`, new Date(Date.now() + tokenExpires * 1000).toISOString());
        settingsRepo.set(`meta_${user.id}_fb_id`, userData.id);
        settingsRepo.set(`meta_${user.id}_fb_name`, userData.name);
      }
      
      // Generate JWT tokens
      const accessTokenJwt = generateToken({ id: user.id, username: user.username, role: user.role || 'user', plan: user.plan || 'free' });
      const refreshToken = generateRefreshToken({ id: user.id, username: user.username });
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      refreshTokensRepo.upsert(user.id, refreshToken, expiresAt.toISOString());
      
      res.json({
        success: true,
        data: {
          user: { id: user.id, username: user.username, email: user.email, role: user.role || 'user', plan: user.plan || 'free' },
          accessToken: accessTokenJwt,
          refreshToken
        }
      });
    } catch (err) {
      console.error('Facebook OAuth callback failed', { error: err.message });
      res.status(500).json({ success: false, error: 'OAuth callback failed: ' + err.message });
    }
  });

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
      refreshTokensRepo.upsert(userId, refreshToken, expiresAt.toISOString());

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
      refreshTokensRepo.upsert(user.id, refreshToken, expiresAt.toISOString());

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
      refreshTokensRepo.upsert(user.id, newRefreshToken, expiresAt.toISOString());

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
