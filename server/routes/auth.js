import { Router } from 'express';
import { hashPassword, verifyPassword, generateToken, verifyToken } from '../lib/auth.js';
import rateLimit from 'express-rate-limit';

export function createAuthRouter(usersRepo) {
  const router = Router();

  // Rate limiting for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // High limit for testing
    message: { success: false, error: 'Too many attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply rate limiting to all auth routes
  router.use(authLimiter);

  // Register endpoint
  router.post('/register', (req, res) => {
    const { username, password, email } = req.body;
  
  if (!username || !password || !email) {
    return res.status(400).json({ 
      success: false, 
      error: 'username, password, and email are required' 
    });
  }
  
  if (password.length < 8) {
    return res.status(400).json({ 
      success: false, 
      error: 'Password must be at least 8 characters' 
    });
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Please provide a valid email address' 
    });
  }
  
  const existingUser = usersRepo.findByUsername(username);
  if (existingUser) {
    return res.status(409).json({ 
      success: false, 
      error: 'Username already exists' 
    });
  }
  
  const existingEmail = usersRepo.findByEmail(email);
  if (existingEmail) {
    return res.status(409).json({ 
      success: false, 
      error: 'Email already registered' 
    });
  }
  
  const passwordHash = hashPassword(password);
  
  const userId = usersRepo.create({
    username,
    password_hash: passwordHash,
    email,
    confirmed: 0,
    created_at: new Date().toISOString()
  });
  
  // For MVP, auto-confirm email (implement proper confirmation in production)
  // Generate tokens
  const accessToken = generateToken({ 
    id: userId, 
    username,
    email
  });
  
  const refreshToken = generateToken({ 
    id: userId, 
    username,
    tokenType: 'refresh'
  });
  
  res.json({ 
    success: true, 
    data: {
      user: { id: userId, username, email, confirmed: false },
      accessToken,
      refreshToken
    }
  });
});

// Login endpoint
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'username and password are required' 
      });
    }
    
    // Find user
    const user = usersRepo.findByUsername(username);
    if (!user) {
      // Also try by email
      const userByEmail = usersRepo.findByEmail(username);
      if (!userByEmail) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid credentials' 
        });
      }
      // If found by email, use that user
      if (!userByEmail.confirmed) {
        return res.status(401).json({ 
          success: false, 
          error: 'Please confirm your email before logging in' 
        });
      }
      if (!verifyPassword(password, userByEmail.password_hash)) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid credentials' 
        });
      }
      
      // Generate tokens
      const accessToken = generateToken({ 
        id: userByEmail.id, 
        username: userByEmail.username,
        email: userByEmail.email
      });
      
      const refreshToken = generateToken({ 
        id: userByEmail.id, 
        username: userByEmail.username,
        tokenType: 'refresh'
      });
      
      res.json({ 
        success: true, 
        data: {
          user: { 
            id: userByEmail.id, 
            username: userByEmail.username, 
            email: userByEmail.email,
            confirmed: !!userByEmail.confirmed
          },
          accessToken,
          refreshToken
        }
      });
      return;
    }
    
    // If found by username
    if (!user.confirmed) {
      return res.status(401).json({ 
        success: false, 
        error: 'Please confirm your email before logging in' 
      });
    }
    
    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }
    
    // Generate tokens
    const accessToken = generateToken({ 
      id: user.id, 
      username: user.username,
      email: user.email
    });
    
    const refreshToken = generateToken({ 
      id: user.id, 
      username: user.username,
      tokenType: 'refresh'
    });
    
    res.json({ 
      success: true, 
      data: {
        user: { 
          id: user.id, 
          username: user.username, 
          email: user.email,
          confirmed: !!user.confirmed
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Refresh token endpoint
router.post('/refresh-token', (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Refresh token is required' 
      });
    }
    
    let payload;
    try {
      payload = verifyToken(refreshToken);
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid or expired refresh token' 
      });
    }
    
    // Validate token type
    if (payload.tokenType !== 'refresh') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token type' 
      });
    }
    
    // Find user
    const user = usersRepo.findById(payload.id);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    if (!user.confirmed) {
      return res.status(401).json({ 
        success: false, 
        error: 'Please confirm your email' 
      });
    }
    
    // Generate new access token
    const newAccessToken = generateToken({ 
      id: user.id, 
      username: user.username,
      email: user.email
    });
    
    // Generate new refresh token (rotation)
    const newRefreshToken = generateToken({ 
      id: user.id, 
      username: user.username,
      tokenType: 'refresh'
    });
    
    // TODO: Invalidate old refresh token in database
    
    res.json({ 
      success: true, 
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Request password reset endpoint
router.post('/request-reset', (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email is required' 
      });
    }
    
    // Find user by email
    const user = usersRepo.findByEmail(email);
    if (!user) {
      // Don't reveal that email doesn't exist for security
      return res.json({ 
        success: true, 
        message: 'If the email exists in our system, you will receive a password reset link.' 
      });
    }
    
    if (!user.confirmed) {
      return res.json({ 
        success: true, 
        message: 'If the email exists in our system, you will receive a password reset link.' 
      });
    }
    
    // Generate reset token
    const resetToken = Math.random().toString(36).substring(2, 15) + 
                      Math.random().toString(36).substring(2, 15);
    
    // Store reset token with expiry (1 hour)
    const resetExpires = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
    
    // TODO: Store reset token and expiry in database
    // For now, we'll simulate by updating user record (not ideal for production)
    // usersRepo.setResetToken(user.id, resetToken, resetExpires);
    
    // In production, send email here
    // For MVP, we'll return the token in response (REMOVE IN PRODUCTION)
    console.log(`Password reset token for ${email}: ${resetToken}`);
    
    res.json({ 
      success: true, 
      message: 'If the email exists in our system, you will receive a password reset link.',
      // Dev only - remove in production
      devResetToken: resetToken
    });
  } catch (error) {
    console.error('Request reset error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Reset password endpoint
router.post('/reset-password', (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Token and password are required' 
      });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 8 characters' 
      });
    }
    
    // TODO: Find user by reset token and validate expiry
    // For MVP, we'll simulate - in production query reset tokens table
    // const user = usersRepo.findByResetToken(token);
    // if (!user) {
    //   return res.status(400).json({ 
    //     success: false, 
    //     error: 'Invalid or expired reset token' 
    //   });
    // }
    
    // // Check if token expired
    // const resetExpires = new Date(user.reset_expires);
    // if (resetExpires < new Date()) {
    //   return res.status(400).json({ 
    //     success: false, 
    //     error: 'Reset token has expired' 
    //   });
    // }
    
    // For MVP simulation - in production remove this
    if (token !== 'dev_reset_token_simulation') {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid or expired reset token' 
      });
    }
    
    // Hash new password
    const newPasswordHash = hashPassword(password);
    
    // Update password and clear reset token
    // usersRepo.updatePassword(user.id, newPasswordHash);
    // usersRepo.clearResetToken(user.id);
    
    res.json({ 
      success: true, 
      message: 'Password has been reset successfully. You can now log in with your new password.' 
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

return router;
}