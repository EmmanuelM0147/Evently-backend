import rateLimit from 'express-rate-limit';

const limiterDefaults = {
  standardHeaders: true,
  legacyHeaders: false,
  // trust proxy is set in app.js; keep validation quiet on Vercel cold starts
  validate: { xForwardedForHeader: false }
};

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  ...limiterDefaults
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again in 15 minutes.'
  },
  skipSuccessfulRequests: true,
  ...limiterDefaults
});

export const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    error: 'Too many password reset attempts, please try again in 1 hour.'
  },
  ...limiterDefaults
});

export const guestLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many invite lookups. Please try again later.' },
  skipSuccessfulRequests: true,
  ...limiterDefaults
});

export const publicRsvpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many RSVP attempts. Please try again in a few minutes.' },
  ...limiterDefaults
});

export const giftLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many gift attempts. Please try again in a few minutes.' },
  ...limiterDefaults
});

export const checkInLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, error: 'Too many check-in scans. Please try again shortly.' },
  ...limiterDefaults
});
