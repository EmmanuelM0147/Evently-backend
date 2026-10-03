import express from 'express';
import { 
  registerUser, 
  loginUser, 
  getUserProfile,
  updateUserProfile,
  verifyEmail,
  resendVerification
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validateRegistration, validateLogin, validateEmailVerification } from '../utils/validation.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public routes
router.post('/register', (req, res) => res.status(410).json({
  success: false,
  error: 'Public registration is disabled. Guests must use an invitation code.'
}));
router.post('/login', authLimiter, validateLogin, loginUser);
router.post('/verify-email', validateEmailVerification, verifyEmail);
router.post('/resend-verification', authLimiter, resendVerification);

// Protected routes
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);

export default router;