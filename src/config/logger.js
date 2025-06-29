import winston from 'winston';
import 'winston-cloudwatch';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define which transports the logger must use
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }),
  
  // File transports
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),
  
  new winston.transports.File({
    filename: 'logs/combined.log',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  })
];

// Add CloudWatch transport for production
if (process.env.NODE_ENV === 'production' && process.env.AWS_REGION) {
  transports.push(
    new winston.transports.CloudWatchLogs({
      logGroupName: process.env.CLOUDWATCH_LOG_GROUP || 'evently-api',
      logStreamName: process.env.CLOUDWATCH_LOG_STREAM || 'api-logs',
      awsRegion: process.env.AWS_REGION,
      messageFormatter: ({ level, message, additionalInfo }) =>
        `[${level}] : ${message} \nAdditional Info: ${JSON.stringify(additionalInfo, null, 2)}`
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' })
  ]
});

// HTTP request logging middleware
export const httpLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'error' : 'info';
    
    logger.log(level, 'HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      requestId: req.requestId
    });
  });
  
  next();
};

// Performance monitoring
export const performanceLogger = {
  logSlowQuery: (query, duration, params = null) => {
    if (duration > 1000) { // Log queries slower than 1 second
      logger.warn('Slow Database Query', {
        query: query.substring(0, 200), // First 200 chars
        duration: `${duration}ms`,
        params: params ? JSON.stringify(params) : null
      });
    }
  },
  
  logMemoryUsage: () => {
    const usage = process.memoryUsage();
    logger.info('Memory Usage', {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`
    });
  }
};

// Business logic logging
export const businessLogger = {
  logUserRegistration: (userId, email) => {
    logger.info('User Registration', {
      event: 'USER_REGISTERED',
      userId,
      email,
      timestamp: new Date().toISOString()
    });
  },
  
  logEventCreation: (eventId, organizerId, title) => {
    logger.info('Event Created', {
      event: 'EVENT_CREATED',
      eventId,
      organizerId,
      title,
      timestamp: new Date().toISOString()
    });
  },
  
  logPaymentInitiated: (paymentId, userId, eventId, amount) => {
    logger.info('Payment Initiated', {
      event: 'PAYMENT_INITIATED',
      paymentId,
      userId,
      eventId,
      amount,
      timestamp: new Date().toISOString()
    });
  },
  
  logPaymentCompleted: (paymentId, reference, amount) => {
    logger.info('Payment Completed', {
      event: 'PAYMENT_COMPLETED',
      paymentId,
      reference,
      amount,
      timestamp: new Date().toISOString()
    });
  },
  
  logRSVPCreated: (rsvpId, userId, eventId, status) => {
    logger.info('RSVP Created', {
      event: 'RSVP_CREATED',
      rsvpId,
      userId,
      eventId,
      status,
      timestamp: new Date().toISOString()
    });
  }
};

// Error logging with context
export const errorLogger = {
  logError: (error, context = {}) => {
    logger.error('Application Error', {
      message: error.message,
      stack: error.stack,
      ...context
    });
  },
  
  logDatabaseError: (error, query, params = null) => {
    logger.error('Database Error', {
      message: error.message,
      code: error.code,
      query: query ? query.substring(0, 200) : null,
      params: params ? JSON.stringify(params) : null,
      stack: error.stack
    });
  },
  
  logPaymentError: (error, paymentId, reference) => {
    logger.error('Payment Error', {
      message: error.message,
      paymentId,
      reference,
      stack: error.stack
    });
  },
  
  logAuthenticationError: (error, email, ip) => {
    logger.error('Authentication Error', {
      message: error.message,
      email,
      ip,
      timestamp: new Date().toISOString()
    });
  }
};

// Security logging
export const securityLogger = {
  logSuspiciousActivity: (type, details, ip, userAgent) => {
    logger.warn('Suspicious Activity', {
      event: 'SECURITY_ALERT',
      type,
      details,
      ip,
      userAgent,
      timestamp: new Date().toISOString()
    });
  },
  
  logRateLimitExceeded: (ip, endpoint, limit) => {
    logger.warn('Rate Limit Exceeded', {
      event: 'RATE_LIMIT_EXCEEDED',
      ip,
      endpoint,
      limit,
      timestamp: new Date().toISOString()
    });
  },
  
  logFailedLogin: (email, ip, reason) => {
    logger.warn('Failed Login Attempt', {
      event: 'FAILED_LOGIN',
      email,
      ip,
      reason,
      timestamp: new Date().toISOString()
    });
  }
};

export default logger;