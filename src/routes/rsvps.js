import express from 'express';
import {
  createOrUpdateRSVP,
  getRSVPs,
  getUserRSVPs,
  getEventRSVPs,
  deleteRSVP
} from '../controllers/rsvpController.js';
import { protect } from '../middleware/auth.js';
import { validateRSVP } from '../utils/validation.js';
import { cacheMiddleware, rsvpCache, rsvpCacheKey } from '../middleware/cache.js';

const router = express.Router();

// All RSVP routes require authentication
router.use(protect);

// RSVP management routes
router.get('/', cacheMiddleware(rsvpCache, rsvpCacheKey, 120), getRSVPs);
router.post('/', validateRSVP, createOrUpdateRSVP);
router.get('/my-rsvps', getUserRSVPs);
router.get('/event/:eventId', getEventRSVPs);
router.delete('/:id', deleteRSVP);

export default router;