import request from 'supertest';
import { pool } from '../../src/config/database.js';
import { paystackRequest } from '../../src/config/paystack.js';
import app from '../../src/app.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Mock dependencies
jest.mock('../../src/config/database.js');
jest.mock('../../src/config/paystack.js');

describe('Payment Controller', () => {
  let authToken;
  let mockUser;
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = generateMockUser();
    authToken = jwt.sign({ id: mockUser.id }, process.env.JWT_SECRET);
    
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
        id: 'test-event-uuid',
        title: 'Paid Conference',
        price: 5000,
        max_attendees: 100,
        is_paid: true,
        is_active: true
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
          user_id: mockUser.id,
          event_id: 'test-event-uuid',
          amount: 5000,
          paystack_reference: 'test_reference_123',
          authorization_url: 'https://checkout.paystack.com/test123',
          created_at: new Date().toISOString()
        }]
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce(mockNoPayments) // Existing payments check
        .mockResolvedValueOnce(mockAttendance) // Attendance check
        .mockResolvedValueOnce(mockPaymentResult) // Payment creation
        .mockResolvedValueOnce(undefined); // COMMIT

      // Mock Paystack API
      paystackRequest.mockResolvedValue(mockPaystackResponse);

      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.authorization_url).toBe(mockPaystackResponse.data.authorization_url);
      expect(response.body.data.amount).toBe(5000);
      expect(paystackRequest).toHaveBeenCalledWith('/transaction/initialize', 'POST', expect.objectContaining({
        email: validPaymentData.attendee_email,
        amount: 500000, // In kobo
        currency: 'NGN'
      }));
    });

    test('should reject payment for free event', async () => {
      const mockFreeEvent = {
        id: 'test-event-uuid',
        title: 'Free Workshop',
        price: 0,
        is_paid: false,
        is_active: true
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockFreeEvent] }) // Event check
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('free');
    });

    test('should reject payment when event is at capacity', async () => {
      const mockEvent = {
        id: 'test-event-uuid',
        max_attendees: 100,
        is_paid: true,
        price: 5000,
        is_active: true
      };

      const mockNoPayments = { rows: [] };
      const mockFullCapacity = { rows: [{ count: '100' }] };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce(mockNoPayments) // Existing payments
        .mockResolvedValueOnce(mockFullCapacity) // Full capacity
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('capacity');
    });

    test('should reject duplicate payment for same event', async () => {
      const mockEvent = {
        id: 'test-event-uuid',
        is_paid: true,
        price: 5000,
        is_active: true
      };

      const mockExistingPayment = {
        rows: [{
          id: 'existing-payment',
          status: 'success',
          paystack_reference: 'existing_ref'
        }]
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce(mockExistingPayment) // Existing payment found
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already paid');
    });

    test('should handle Paystack API failure', async () => {
      const mockEvent = {
        id: 'test-event-uuid',
        is_paid: true,
        price: 5000,
        is_active: true,
        max_attendees: 100
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing payments
        .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // Attendance check
        .mockResolvedValueOnce(undefined); // ROLLBACK

      paystackRequest.mockResolvedValue({
        status: false,
        message: 'Invalid API key'
      });

      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Payment initialization failed');
    });

    test('should validate required fields', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should validate email format', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validPaymentData,
          attendee_email: 'invalid-email'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/payments/initialize')
        .send(validPaymentData);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/payments/verify/:reference', () => {
    test('should verify successful payment', async () => {
      const reference = 'test_payment_ref_123';
      
      // Mock payment record
      const mockPayment = {
        id: 'payment-uuid',
        user_id: mockUser.id,
        event_id: 'event-uuid',
        amount: 5000,
        paystack_reference: reference,
        status: 'pending'
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

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockPayment] }) // Payment lookup
        .mockResolvedValueOnce(undefined) // Payment update
        .mockResolvedValueOnce({ rows: [] }) // RSVP check
        .mockResolvedValueOnce(undefined) // RSVP creation
        .mockResolvedValueOnce(mockEvent) // Event details
        .mockResolvedValueOnce(undefined); // COMMIT

      paystackRequest.mockResolvedValue(mockVerificationResponse);

      const response = await request(app)
        .get(`/api/payments/verify/${reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('success');
      expect(response.body.message).toContain('verified successfully');
    });

    test('should handle failed payment verification', async () => {
      const reference = 'test_payment_ref_failed';
      
      const mockPayment = {
        id: 'payment-uuid',
        status: 'pending',
        amount: 5000,
        event_id: 'event-uuid'
      };

      const mockFailedVerification = {
        status: true,
        data: {
          status: 'failed',
          reference: reference,
          gateway_response: 'Declined'
        }
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockPayment] }) // Payment lookup
        .mockResolvedValueOnce(undefined) // Payment update
        .mockResolvedValueOnce(undefined); // COMMIT

      paystackRequest.mockResolvedValue(mockFailedVerification);

      const response = await request(app)
        .get(`/api/payments/verify/${reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('failed');
      expect(response.body.message).toContain('verification failed');
    });

    test('should return success for already verified payment', async () => {
      const reference = 'already_verified_ref';
      
      const mockVerifiedPayment = {
        id: 'payment-uuid',
        status: 'success',
        amount: 5000,
        paystack_reference: reference,
        paid_at: new Date().toISOString()
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockVerifiedPayment] }) // Payment lookup
        .mockResolvedValueOnce(undefined); // ROLLBACK (no changes needed)

      const response = await request(app)
        .get(`/api/payments/verify/${reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('already verified');
      expect(response.body.data.status).toBe('success');
    });

    test('should handle non-existent payment reference', async () => {
      const reference = 'non_existent_ref';
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Payment not found
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .get(`/api/payments/verify/${reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Payment record not found');
    });

    test('should handle Paystack verification failure', async () => {
      const reference = 'test_ref_api_error';
      
      const mockPayment = {
        id: 'payment-uuid',
        status: 'pending'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockPayment] }) // Payment lookup
        .mockResolvedValueOnce(undefined); // ROLLBACK

      paystackRequest.mockResolvedValue({
        status: false,
        message: 'Transaction not found'
      });

      const response = await request(app)
        .get(`/api/payments/verify/${reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Payment verification failed');
    });
  });

  describe('GET /api/payments/history', () => {
    test('should return user payment history', async () => {
      const mockPayments = {
        rows: [
          {
            id: 'payment-1',
            amount: 5000,
            currency: 'NGN',
            status: 'success',
            event_title: 'Conference 2024',
            event_date: new Date().toISOString(),
            event_location: 'Lagos, Nigeria',
            attendee_name: 'John Doe',
            attendee_email: 'john@example.com',
            created_at: new Date().toISOString(),
            paid_at: new Date().toISOString()
          }
        ]
      };

      const mockCount = { rows: [{ total: 1 }] };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce(mockPayments)
        .mockResolvedValueOnce(mockCount);

      const response = await request(app)
        .get('/api/payments/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].event_title).toBe('Conference 2024');
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.totalPayments).toBe(1);
    });

    test('should filter payments by status', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const response = await request(app)
        .get('/api/payments/history?status=success')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });

    test('should handle pagination', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const response = await request(app)
        .get('/api/payments/history?page=2&limit=5')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination.currentPage).toBe(2);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/payments/history');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/payments/webhook', () => {
    test('should handle successful Paystack webhook', async () => {
      const webhookData = {
        event: 'charge.success',
        data: {
          reference: 'webhook_test_ref_123',
          status: 'success',
          amount: 500000,
          gateway_response: 'Successful'
        }
      };

      // Mock payment update
      const mockPaymentUpdate = {
        rows: [{
          user_id: mockUser.id,
          event_id: 'event-uuid',
          amount: 5000
        }]
      };

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(mockPaymentUpdate) // Payment lookup and update
        .mockResolvedValueOnce(undefined) // RSVP creation/update
        .mockResolvedValueOnce(undefined); // COMMIT

      // Mock webhook signature verification
      const hash = crypto
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(webhookData))
        .digest('hex');

      const response = await request(app)
        .post('/api/payments/webhook')
        .set('x-paystack-signature', hash)
        .send(webhookData);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    test('should reject webhook with invalid signature', async () => {
      const webhookData = {
        event: 'charge.success',
        data: {
          reference: 'test_ref',
          status: 'success'
        }
      };

      const response = await request(app)
        .post('/api/payments/webhook')
        .set('x-paystack-signature', 'invalid_signature')
        .send(webhookData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid signature');
    });

    test('should handle webhook for non-existent payment', async () => {
      const webhookData = {
        event: 'charge.success',
        data: {
          reference: 'non_existent_ref',
          status: 'success'
        }
      };

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Payment not found
        .mockResolvedValueOnce(undefined); // COMMIT (no changes)

      const hash = crypto
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(webhookData))
        .digest('hex');

      const response = await request(app)
        .post('/api/payments/webhook')
        .set('x-paystack-signature', hash)
        .send(webhookData);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    test('should handle webhook database errors', async () => {
      const webhookData = {
        event: 'charge.success',
        data: {
          reference: 'error_ref',
          status: 'success'
        }
      };

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')) // Payment update fails
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const hash = crypto
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(webhookData))
        .digest('hex');

      const response = await request(app)
        .post('/api/payments/webhook')
        .set('x-paystack-signature', hash)
        .send(webhookData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Webhook processing failed');
    });

    test('should ignore non-charge events', async () => {
      const webhookData = {
        event: 'invoice.create',
        data: {
          reference: 'invoice_ref'
        }
      };

      const hash = crypto
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(webhookData))
        .digest('hex');

      const response = await request(app)
        .post('/api/payments/webhook')
        .set('x-paystack-signature', hash)
        .send(webhookData);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });
  });

  describe('Payment Flow Integration', () => {
    test('should complete full payment workflow', async () => {
      const eventData = {
        id: 'test-event-uuid',
        title: 'Paid Workshop',
        price: 10000,
        is_paid: true,
        is_active: true,
        max_attendees: 50
      };

      const paymentData = {
        event_id: eventData.id,
        attendee_name: 'John Doe',
        attendee_email: 'john@example.com'
      };

      // Step 1: Initialize payment
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [eventData] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing payments
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // Current attendance
        .mockResolvedValueOnce({ rows: [{
          id: 'payment-uuid',
          paystack_reference: 'test_ref_123'
        }] }) // Payment creation
        .mockResolvedValueOnce(undefined); // COMMIT

      paystackRequest.mockResolvedValue({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/test123',
          reference: 'test_ref_123'
        }
      });

      const initResponse = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      expect(initResponse.status).toBe(201);
      expect(initResponse.body.data.reference).toBe('test_ref_123');

      // Step 2: Verify payment
      const reference = initResponse.body.data.reference;
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{
          id: 'payment-uuid',
          status: 'pending',
          user_id: mockUser.id,
          event_id: eventData.id,
          amount: 10000
        }] }) // Payment lookup
        .mockResolvedValueOnce(undefined) // Payment update
        .mockResolvedValueOnce({ rows: [] }) // RSVP check
        .mockResolvedValueOnce(undefined) // RSVP creation
        .mockResolvedValueOnce({ rows: [{ title: eventData.title }] }) // Event details
        .mockResolvedValueOnce(undefined); // COMMIT

      paystackRequest.mockResolvedValue({
        status: true,
        data: {
          status: 'success',
          reference: reference,
          gateway_response: 'Successful'
        }
      });

      const verifyResponse = await request(app)
        .get(`/api/payments/verify/${reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.data.status).toBe('success');
    });

    test('should handle payment timeout scenario', async () => {
      const reference = 'timeout_ref_123';
      
      const mockPayment = {
        id: 'payment-uuid',
        status: 'pending',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockPayment] }) // Payment lookup
        .mockResolvedValueOnce(undefined); // ROLLBACK

      paystackRequest.mockResolvedValue({
        status: true,
        data: {
          status: 'abandoned',
          reference: reference,
          gateway_response: 'Transaction abandoned'
        }
      });

      const response = await request(app)
        .get(`/api/payments/verify/${reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('failed');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle concurrent payment initialization attempts', async () => {
      const eventData = {
        id: 'test-event-uuid',
        is_paid: true,
        price: 5000,
        is_active: true,
        max_attendees: 1 // Only 1 spot
      };

      const paymentData = {
        event_id: eventData.id,
        attendee_name: 'John Doe',
        attendee_email: 'john@example.com'
      };

      pool.query.mockResolvedValue({ rows: [mockUser] }); // Auth for both

      // First succeeds, second fails due to capacity
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [eventData] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing payments
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // No attendance
        .mockResolvedValueOnce({ rows: [{ id: 'payment-1' }] }) // Payment creation
        .mockResolvedValueOnce(undefined) // COMMIT
        // Second request
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [eventData] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing payments
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // At capacity
        .mockResolvedValueOnce(undefined); // ROLLBACK

      paystackRequest.mockResolvedValue({
        status: true,
        data: { authorization_url: 'https://checkout.paystack.com/test' }
      });

      const promises = [
        request(app)
          .post('/api/payments/initialize')
          .set('Authorization', `Bearer ${authToken}`)
          .send(paymentData),
        request(app)
          .post('/api/payments/initialize')
          .set('Authorization', `Bearer ${authToken}`)
          .send(paymentData)
      ];

      const responses = await Promise.all(promises);
      
      const successCount = responses.filter(r => r.status === 201).length;
      const failCount = responses.filter(r => r.status === 400).length;
      
      expect(successCount).toBe(1);
      expect(failCount).toBe(1);
    });

    test('should handle malformed webhook data', async () => {
      const malformedData = {
        // Missing required fields
        event: 'charge.success'
      };

      const hash = crypto
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(malformedData))
        .digest('hex');

      const response = await request(app)
        .post('/api/payments/webhook')
        .set('x-paystack-signature', hash)
        .send(malformedData);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    test('should handle very large payment amounts', async () => {
      const largeAmountEvent = {
        id: 'test-event-uuid',
        price: 9999999, // Very large amount
        is_paid: true,
        is_active: true,
        max_attendees: 100
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [largeAmountEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing payments
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // Attendance
        .mockResolvedValueOnce({ rows: [{ id: 'payment-uuid' }] }) // Payment creation
        .mockResolvedValueOnce(undefined); // COMMIT

      paystackRequest.mockResolvedValue({
        status: true,
        data: { authorization_url: 'https://checkout.paystack.com/test' }
      });

      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          event_id: largeAmountEvent.id,
          attendee_name: 'John Doe',
          attendee_email: 'john@example.com'
        });

      expect(response.status).toBe(201);
    });
  });
});