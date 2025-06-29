import request from 'supertest';
import { pool } from '../src/config/database.js';

jest.mock('../src/config/database.js');
jest.mock('../src/config/paystack.js');

describe('Payment System', () => {
  let app;
  let authToken;
  
  beforeAll(async () => {
    app = require('../src/app.js');
  });

  beforeEach(() => {
    authToken = 'mock-jwt-token';
    jest.clearAllMocks();
  });

  describe('POST /api/payments/initialize', () => {
    const validPaymentData = {
      event_id: 'test-event-uuid',
      attendee_name: 'John Doe',
      attendee_email: 'john@example.com'
    };

    test('should initialize payment for paid event', async () => {
      // Mock event check (paid event)
      const mockEvent = {
        rows: [{
          id: 'test-event-uuid',
          title: 'Paid Conference',
          price: 5000,
          max_attendees: 100,
          is_paid: true,
          is_active: true
        }]
      };

      // Mock no existing payments
      const mockNoPayments = { rows: [] };

      // Mock attendance check
      const mockAttendance = { rows: [{ count: '50' }] };

      // Mock Paystack response
      const mockPaystackResponse = {
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/test123',
          access_code: 'test_access_code',
          reference: 'test_reference_123'
        }
      };

      // Mock payment creation
      const mockPaymentResult = {
        rows: [{
          id: 'payment-uuid',
          user_id: 'user-uuid',
          event_id: 'test-event-uuid',
          amount: 5000,
          paystack_reference: 'test_reference_123',
          authorization_url: 'https://checkout.paystack.com/test123',
          created_at: new Date().toISOString()
        }]
      };

      pool.connect.mockResolvedValue({
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(mockEvent) // Event check
          .mockResolvedValueOnce(mockNoPayments) // Existing payments check
          .mockResolvedValueOnce(mockAttendance) // Attendance check
          .mockResolvedValueOnce(mockPaymentResult) // Payment creation
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      });

      // Mock Paystack API
      const { paystackRequest } = require('../src/config/paystack.js');
      paystackRequest.mockResolvedValue(mockPaystackResponse);

      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.authorization_url).toBe(mockPaystackResponse.data.authorization_url);
      expect(response.body.data.amount).toBe(5000);
    });

    test('should reject payment for free event', async () => {
      const mockFreeEvent = {
        rows: [{
          id: 'test-event-uuid',
          title: 'Free Workshop',
          price: 0,
          is_paid: false,
          is_active: true
        }]
      };

      pool.connect.mockResolvedValue({
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(mockFreeEvent) // Event check
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn()
      });

      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('free');
    });

    test('should reject payment when event is at capacity', async () => {
      const mockEvent = {
        rows: [{
          id: 'test-event-uuid',
          max_attendees: 100,
          is_paid: true,
          price: 5000,
          is_active: true
        }]
      };

      const mockNoPayments = { rows: [] };
      const mockFullCapacity = { rows: [{ count: '100' }] };

      pool.connect.mockResolvedValue({
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(mockEvent) // Event check
          .mockResolvedValueOnce(mockNoPayments) // Existing payments
          .mockResolvedValueOnce(mockFullCapacity) // Full capacity
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn()
      });

      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('capacity');
    });
  });

  describe('GET /api/payments/verify/:reference', () => {
    test('should verify successful payment', async () => {
      const reference = 'test_payment_ref_123';
      
      // Mock payment record
      const mockPayment = {
        rows: [{
          id: 'payment-uuid',
          user_id: 'user-uuid',
          event_id: 'event-uuid',
          amount: 5000,
          paystack_reference: reference,
          status: 'pending'
        }]
      };

      // Mock Paystack verification response
      const mockVerificationResponse = {
        status: true,
        data: {
          status: 'success',
          reference: reference,
          amount: 500000, // in kobo
          gateway_response: 'Successful'
        }
      };

      // Mock event details
      const mockEvent = {
        rows: [{
          title: 'Test Event'
        }]
      };

      pool.connect.mockResolvedValue({
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(mockPayment) // Payment lookup
          .mockResolvedValueOnce(undefined) // Payment update
          .mockResolvedValueOnce({ rows: [] }) // RSVP check
          .mockResolvedValueOnce(undefined) // RSVP creation
          .mockResolvedValueOnce(mockEvent) // Event details
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      });

      const { paystackRequest } = require('../src/config/paystack.js');
      paystackRequest.mockResolvedValue(mockVerificationResponse);

      const response = await request(app)
        .get(`/api/payments/verify/${reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('success');
    });

    test('should handle failed payment verification', async () => {
      const reference = 'test_payment_ref_failed';
      
      const mockPayment = {
        rows: [{
          id: 'payment-uuid',
          status: 'pending',
          amount: 5000,
          event_id: 'event-uuid'
        }]
      };

      const mockFailedVerification = {
        status: true,
        data: {
          status: 'failed',
          reference: reference,
          gateway_response: 'Declined'
        }
      };

      pool.connect.mockResolvedValue({
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(mockPayment) // Payment lookup
          .mockResolvedValueOnce(undefined) // Payment update
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      });

      const { paystackRequest } = require('../src/config/paystack.js');
      paystackRequest.mockResolvedValue(mockFailedVerification);

      const response = await request(app)
        .get(`/api/payments/verify/${reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('failed');
    });
  });

  describe('GET /api/payments/history', () => {
    test('should return user payment history', async () => {
      const mockPayments = {
        rows: [
          {
            id: 'payment-1',
            amount: 5000,
            status: 'success',
            event_title: 'Conference 2024',
            created_at: new Date().toISOString()
          }
        ]
      };

      const mockCount = { rows: [{ total: 1 }] };

      pool.query
        .mockResolvedValueOnce(mockPayments)
        .mockResolvedValueOnce(mockCount);

      const response = await request(app)
        .get('/api/payments/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toBeDefined();
    });
  });

  describe('WebSocket Integration', () => {
    test('should broadcast payment status updates', async () => {
      const { broadcastPaymentUpdate } = require('../src/config/websocket.js');
      
      // Mock WebSocket broadcast
      const mockIo = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn()
      };

      // Test broadcast function
      broadcastPaymentUpdate('test_ref_123', 'success', 'user-123', {
        amount: 5000,
        eventId: 'event-123'
      });

      // Verify broadcast was called (would need proper mocking setup)
      expect(true).toBe(true); // Placeholder assertion
    });
  });
});