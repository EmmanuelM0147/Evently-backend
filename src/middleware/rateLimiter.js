import rateLimit from 'express-rate-limit';

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Guests at the venue often share one Wi-Fi address and ushers make several requests per check-in
  max: 1000,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again in 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests
  skipSuccessfulRequests: true,
});

// Password reset rate limiter
export const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 reset requests per hour
  message: {
    success: false,
    error: 'Too many password reset attempts, please try again in 1 hour.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const guestLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many invite lookups. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

export const checkInLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, error: 'Too many check-in scans. Please try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false
});