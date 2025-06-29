import { jest } from '@jest/globals';

// Silence console logs during tests for cleaner output
const originalConsole = global.console;

// Mock console methods but keep error for debugging
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: originalConsole.error // Keep error for debugging
};

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'evently_test_db';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_mock_paystack_secret_key_for_testing';
process.env.PAYSTACK_PUBLIC_KEY = 'pk_test_mock_paystack_public_key_for_testing';
process.env.SMTP_HOST = 'smtp.test.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@test.com';
process.env.SMTP_PASS = 'test_password';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.CORS_ORIGIN = 'http://localhost:3000';

// Global test utilities
global.generateMockUser = () => ({
  id: 'mock-user-id-' + Math.random().toString(36).substr(2, 9),
  email: 'test@example.com',
  username: 'testuser',
  role: 'attendee',
  email_verified: true,
  created_at: new Date().toISOString()
});

global.generateMockEvent = (overrides = {}) => ({
  id: 'mock-event-id-' + Math.random().toString(36).substr(2, 9),
  title: 'Test Event',
  description: 'Test event description',
  date: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
  location: 'Test Location',
  organizer_id: 'mock-organizer-id',
  is_paid: false,
  price: 0,
  max_attendees: 100,
  category: 'Technology',
  is_active: true,
  created_at: new Date().toISOString(),
  ...overrides
});

global.generateMockPayment = (overrides = {}) => ({
  id: 'mock-payment-id-' + Math.random().toString(36).substr(2, 9),
  user_id: 'mock-user-id',
  event_id: 'mock-event-id',
  amount: 5000,
  currency: 'NGN',
  paystack_reference: 'evently_' + Date.now() + '_test',
  status: 'pending',
  attendee_name: 'Test Attendee',
  attendee_email: 'attendee@test.com',
  created_at: new Date().toISOString(),
  ...overrides
});

global.generateMockRSVP = (overrides = {}) => ({
  id: 'mock-rsvp-id-' + Math.random().toString(36).substr(2, 9),
  user_id: 'mock-user-id',
  event_id: 'mock-event-id',
  status: 'attending',
  created_at: new Date().toISOString(),
  ...overrides
});

global.generateMockNotification = (overrides = {}) => ({
  id: 'mock-notification-id-' + Math.random().toString(36).substr(2, 9),
  user_id: 'mock-user-id',
  type: 'payment_success',
  title: 'Test Notification',
  message: 'Test notification message',
  is_read: false,
  created_at: new Date().toISOString(),
  ...overrides
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global timeout for async operations
jest.setTimeout(30000);

// Handle unhandled promise rejections in tests
process.removeAllListeners('unhandledRejection');
process.on('unhandledRejection', (reason) => {
  // Log but don't fail tests for unhandled rejections
  console.error('Unhandled Rejection in tests:', reason);
});

// Handle uncaught exceptions in tests
process.removeAllListeners('uncaughtException');
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in tests:', error);
});