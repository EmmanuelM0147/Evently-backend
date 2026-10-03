import { body } from 'express-validator';

export const validateRegistration = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

export const validateLogin = [
  // normalizeEmail() would strip dots from Gmail addresses and stop ushers created with them from signing in
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

export const validateEmailVerification = [
  body('token')
    .isLength({ min: 32, max: 128 })
    .withMessage('Invalid verification token format')
];

export const validateRSVP = [
  body('event_id')
    .isUUID()
    .withMessage('Valid event ID is required'),
  
  body('status')
    .isIn(['attending', 'declined', 'maybe'])
    .withMessage('Status must be: attending, declined, or maybe')
];

export const validateEvent = [
  body('title')
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage('Title must be between 3 and 255 characters'),
  
  body('description')
    .notEmpty()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description is required and must be less than 2000 characters'),
  
  body('date')
    .isISO8601()
    .withMessage('Valid date and time is required (ISO 8601 format)')
    .custom((value) => {
      const eventDate = new Date(value);
      const now = new Date();
      if (eventDate <= now) {
        throw new Error('Event date must be in the future');
      }
      return true;
    }),
  
  body('location')
    .trim()
    .isLength({ min: 3, max: 500 })
    .withMessage('Location must be between 3 and 500 characters'),
  
  body('is_paid')
    .isBoolean()
    .withMessage('is_paid must be a boolean value'),
  
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number')
    .custom((value, { req }) => {
      if (req.body.is_paid && (value === undefined || value <= 0)) {
        throw new Error('Price is required for paid events');
      }
      if (!req.body.is_paid && value > 0) {
        throw new Error('Price should be 0 for free events');
      }
      return true;
    }),
  
  body('max_capacity')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Max capacity must be between 1 and 10000'),
  
  body('category')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Category must be between 2 and 100 characters')
];

export const validatePaymentInitialization = [
  body('event_id')
    .isUUID()
    .withMessage('Valid event ID is required'),
  
  body('attendee_name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Attendee name must be between 2 and 255 characters'),
  
  body('attendee_email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid attendee email is required')
];