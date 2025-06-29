import express from 'express';
import {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  getUserEvents
} from '../controllers/eventController.js';
import { protect } from '../middleware/auth.js';
import { validateEvent } from '../utils/validation.js';
import { cacheMiddleware, eventCache, eventCacheKey, eventDetailCacheKey } from '../middleware/cache.js';

const router = express.Router();

// Public routes
router.get('/', cacheMiddleware(eventCache, eventCacheKey, 300), getEvents);
router.get('/:id', cacheMiddleware(eventCache, eventDetailCacheKey, 600), getEventById);

// Protected routes
router.post('/', protect, validateEvent, createEvent);
router.put('/:id', protect, validateEvent, updateEvent);
router.delete('/:id', protect, deleteEvent);
router.get('/user/my-events', protect, getUserEvents);

export default router;