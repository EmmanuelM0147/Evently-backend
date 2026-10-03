import compression from 'compression';

// Performance monitoring middleware
export const performanceMonitor = (req, res, next) => {
  const start = Date.now();
  
  // Add request ID for tracking
  req.requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Override end method to log performance
  const originalEnd = res.end;
  let responseEnded = false;
  res.end = function(...args) {
    if (responseEnded) {
      return this;
    }

    responseEnded = true;
    const duration = Date.now() - start;
    
    // Log slow requests (>500ms)
    if (duration > 500) {
      console.warn(`⚠️  Slow request [${req.requestId}]: ${req.method} ${req.originalUrl} - ${duration}ms`);
    } else if (duration > 200) {
      console.log(`📊 Request [${req.requestId}]: ${req.method} ${req.originalUrl} - ${duration}ms`);
    }
    
    // Add performance headers
    if (!res.headersSent) {
      res.set('X-Response-Time', `${duration}ms`);
      res.set('X-Request-ID', req.requestId);
    }
    
    return originalEnd.apply(this, args);
  };
  
  next();
};

// Compression middleware for responses
export const compressionMiddleware = compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  threshold: 1024, // Only compress responses > 1KB
  level: 6 // Balanced compression level
});

// Request size limiter
export const requestSizeLimiter = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.get('content-length') || '0');
    const maxSizeBytes = parseInt(maxSize) * 1024 * 1024; // Convert MB to bytes
    
    if (contentLength > maxSizeBytes) {
      return res.status(413).json({
        success: false,
        error: 'Request entity too large'
      });
    }
    
    next();
  };
};