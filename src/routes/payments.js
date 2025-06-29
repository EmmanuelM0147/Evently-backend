import express from 'express';
import {
  initializePayment,
  verifyPayment,
  getPaymentHistory,
  handlePaystackWebhook
} from '../controllers/paymentController.js';
import { protect } from '../middleware/auth.js';
import { validatePaymentInitialization } from '../utils/validation.js';

const router = express.Router();

// Protected routes
router.post('/initialize', protect, validatePaymentInitialization, initializePayment);
router.get('/verify/:reference', protect, verifyPayment);
router.get('/history', protect, getPaymentHistory);

// Public webhook endpoint (signature validated in controller)
router.post('/webhook', handlePaystackWebhook);

export default router;