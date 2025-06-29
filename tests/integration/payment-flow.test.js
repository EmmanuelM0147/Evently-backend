import request from 'supertest';
import { pool } from '../../src/config/database.js';
import app from '../../src/app.js';
import jwt from 'jsonwebtoken';

jest.mock('../../src/config/database.js');
jest.mock('../../src/config/paystack.js');

describe('Payment Integration Flow', () => {
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

  describe('Complete Payment Flow', () => {
    test('should complete full payment workflow', async () => {
      // Step 1: Create a paid event
      const eventData = {
        title: 'Paid Workshop',
        description: 'Premium workshop with payment required',
        date: new Date(Date.now() + 86400000).toISOString(),
        location: 'Lagos, Nigeria',
        is_paid: true,
        price: 10000,
        max_capacity: 50,
        category: 'Business'
      };

      const mockEvent = generateMockEvent(eventData);

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event creation
        .mockResolvedValueOnce(undefined); // COMMIT

      const eventResponse = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(eventData);

      expect(eventResponse.status).toBe(201);
      const createdEvent = eventResponse.body.data;

      // Step 2: Initialize payment for the event
      const paymentData = {
        event_id: createdEvent.id,
        attendee_name: 'John Doe',
        attendee_email: 'john@example.com'
      };

      // Mock payment initialization
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing payments
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // Current attendance
        .mockResolvedValueOnce({ rows: [generateMockPayment({
          event_id: createdEvent.id,
          paystack_reference: 'test_ref_123'
        })] }) // Payment creation
        .mockResolvedValueOnce(undefined); // COMMIT

      const { paystackRequest } = await import('../../src/config/paystack.js');
      paystackRequest.mockResolvedValue({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/test123',
          access_code: 'test_access_code',
          reference: 'test_ref_123'
        }
      });

      const paymentInitResponse = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      expect(paymentInitResponse.status).toBe(201);
      expect(paymentInitResponse.body.data.authorization_url).toBeDefined();
      expect(paymentInitResponse.body.data.reference).toBe('test_ref_123');

      // Step 3: Verify payment (simulate successful payment)
      const paymentReference = paymentInitResponse.body.data.reference;

      // Mock payment verification
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [generateMockPayment({
          paystack_reference: paymentReference,
          status: 'pending'
        })] }) // Payment lookup
        .mockResolvedValueOnce(undefined) // Payment status update
        .mockResolvedValueOnce({ rows: [] }) // RSVP check
        .mockResolvedValueOnce(undefined) // RSVP creation
        .mockResolvedValueOnce({ rows: [{ title: mockEvent.title }] }) // Event details
        .mockResolvedValueOnce(undefined); // COMMIT

      paystackRequest.mockResolvedValue({
        status: true,
        data: {
          status: 'success',
          reference: paymentReference,
          amount: 1000000, // in kobo
          gateway_response: 'Successful'
        }
      });

      const verifyResponse = await request(app)
        .get(`/api/payments/verify/${paymentReference}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.data.status).toBe('success');

      // Step 4: Verify RSVP was created
      const mockRSVPs = [{
        id: 'rsvp-uuid',
        event_id: createdEvent.id,
        status: 'attending',
        title: mockEvent.title
      }];

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: mockRSVPs })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const rsvpResponse = await request(app)
        .get('/api/rsvps/my-rsvps')
        .set('Authorization', `Bearer ${authToken}`);

      expect(rsvpResponse.status).toBe(200);
      expect(rsvpResponse.body.data).toHaveLength(1);
      expect(rsvpResponse.body.data[0].status).toBe('attending');

      // Step 5: Check payment history
      const mockPaymentHistory = [{
        id: 'payment-uuid',
        amount: 10000,
        status: 'success',
        event_title: mockEvent.title,
        created_at: new Date().toISOString()
      }];

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: mockPaymentHistory })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const historyResponse = await request(app)
        .get('/api/payments/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(historyResponse.status).toBe(200);
      expect(historyResponse.body.data).toHaveLength(1);
      expect(historyResponse.body.data[0].status).toBe('success');
    });

    test('should handle payment failure correctly', async () => {
      const mockEvent = generateMockEvent({ is_paid: true, price: 5000 });
      const paymentReference = 'failed_payment_ref_123';

      // Mock failed payment verification
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [generateMockPayment({
          paystack_reference: paymentReference,
          status: 'pending'
        })] }) // Payment lookup
        .mockResolvedValueOnce(undefined) // Payment status update
        .mockResolvedValueOnce(undefined); // COMMIT

      const { paystackRequest } = await import('../../src/config/paystack.js');
      paystackRequest.mockResolvedValue({
        status: true,
        data: {
          status: 'failed',
          reference: paymentReference,
          gateway_response: 'Declined by bank'
        }
      });

      const verifyResponse = await request(app)
        .get(`/api/payments/verify/${paymentReference}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.data.status).toBe('failed');
      expect(verifyResponse.body.message).toContain('verification failed');
    });

    test('should prevent duplicate payments for same event', async () => {
      const mockEvent = generateMockEvent({ is_paid: true, price: 5000 });

      // Mock existing successful payment
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [generateMockPayment({
          status: 'success'
        })] }) // Existing payment
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const paymentData = {
        event_id: mockEvent.id,
        attendee_name: 'John Doe',
        attendee_email: 'john@example.com'
      };

      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already paid');
    });

    test('should handle webhook notifications', async () => {
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
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{
          user_id: mockUser.id,
          event_id: 'event-uuid',
          amount: 5000
        }] }) // Payment lookup and update
        .mockResolvedValueOnce(undefined) // RSVP creation
        .mockResolvedValueOnce(undefined); // COMMIT

      // Mock webhook signature verification (simplified for testing)
      const crypto = await import('crypto');
      const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
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

  describe('Edge Cases and Error Handling', () => {
    test('should handle Paystack API failures', async () => {
      const mockEvent = generateMockEvent({ is_paid: true, price: 5000 });

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing payments
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // Current attendance
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const { paystackRequest } = await import('../../src/config/paystack.js');
      paystackRequest.mockRejectedValue(new Error('Paystack API unavailable'));

      const paymentData = {
        event_id: mockEvent.id,
        attendee_name: 'John Doe',
        attendee_email: 'john@example.com'
      };

      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Payment initialization failed');
    });

    test('should handle concurrent payment attempts', async () => {
      const mockEvent = generateMockEvent({ 
        is_paid: true, 
        price: 5000,
        max_attendees: 1 // Only 1 spot
      });

      pool.query.mockResolvedValue({ rows: [mockUser] }); // Auth for both

      // Mock first payment succeeds, second fails due to capacity
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN - first request
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing payments
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Current attendance
        .mockResolvedValueOnce({ rows: [generateMockPayment()] }) // Payment creation
        .mockResolvedValueOnce(undefined) // COMMIT
        // Second request
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing payments
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // At capacity
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const { paystackRequest } = await import('../../src/config/paystack.js');
      paystackRequest.mockResolvedValue({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/test',
          reference: 'test_ref'
        }
      });

      const paymentData = {
        event_id: mockEvent.id,
        attendee_name: 'John Doe',
        attendee_email: 'john@example.com'
      };

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
      
      // One should succeed, one should fail
      const successCount = responses.filter(r => r.status === 201).length;
      const failCount = responses.filter(r => r.status === 400).length;
      
      expect(successCount).toBe(1);
      expect(failCount).toBe(1);
    });
  });
});