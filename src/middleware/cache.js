import NodeCache from 'node-cache';

// Create cache instances with different TTL settings
export const eventCache = new NodeCache({ 
  stdTTL: 300, // 5 minutes for events
  checkperiod: 60, // Check for expired keys every minute
  useClones: false // For better performance
});

export const rsvpCache = new NodeCache({ 
  stdTTL: 120, // 2 minutes for RSVPs (more dynamic data)
  checkperiod: 30,
  useClones: false
});

// Cache middleware factory
export const cacheMiddleware = (cache, keyGenerator, ttl = null) => {
  return (req, res, next) => {
    const key = keyGenerator(req);
    const cachedData = cache.get(key);
    
    if (cachedData) {
      return res.json(cachedData);
    }
    
    // Store original json method
    const originalJson = res.json;
    
    // Override json method to cache response
    res.json = function(data) {
      if (res.statusCode === 200 && data.success) {
        cache.set(key, data, ttl);
      }
      return originalJson.call(this, data);
    };
    
    next();
  };
};

// Key generators for different endpoints
export const eventCacheKey = (req) => {
  const { page = 1, limit = 10, category, search, location, date_from, date_to } = req.query;
  return `events:${page}:${limit}:${category || 'all'}:${search || 'none'}:${location || 'all'}:${date_from || 'none'}:${date_to || 'none'}`;
};

export const eventDetailCacheKey = (req) => `event:${req.params.id}`;

export const rsvpCacheKey = (req) => {
  const { event_id, user_id, page = 1, limit = 10 } = req.query;
  return `rsvps:${event_id || 'all'}:${user_id || 'all'}:${page}:${limit}`;
};

// Cache invalidation helpers
export const invalidateEventCache = (eventId = null) => {
  const keys = eventCache.keys();
  keys.forEach(key => {
    if (key.startsWith('events:') || (eventId && key === `event:${eventId}`)) {
      eventCache.del(key);
    }
  });
};

export const invalidateRsvpCache = (eventId = null, userId = null) => {
  const keys = rsvpCache.keys();
  keys.forEach(key => {
    if (key.startsWith('rsvps:')) {
      rsvpCache.del(key);
    }
  });
  
  // Also invalidate related event cache since RSVP counts changed
  if (eventId) {
    invalidateEventCache(eventId);
  }
};