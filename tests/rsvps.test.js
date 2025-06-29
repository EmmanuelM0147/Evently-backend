import request from 'supertest';
import { pool } from '../src/config/database.js';

jest.mock('../src/config/database.js');

describe('RSVPs API', () => {
  let app;
  let authToken;
  
  beforeAll(async () => {
    app = require('../src/app.js');
  });

  beforeEach(() => {
    authToken = 'mock-jwt-token';
    jest.clearAllMocks();
  });

  describe('POST /api/rsvps', () => {
    const validRSVPData = {
      event_id: 'test-event-uuid',
      status: 'attending'
    };

    test('should create RSVP with valid data', async () => {
      // Mock event check
      const mockEvent = {
        rows: [{
          id: 'test-event-uuid',
          title: 'Test Event',
          date: '2024-12-31T18:00:00.000Z',
          max_attendees: 100,
          is_active: true
        }]
      };

      // Mock current RSVP check (no existing RSVP)
      const mockNoRSVP = { rows: [] };

      // Mock attendance count
      const mockAttendance = { rows: [{ count: '50' }] };

      // Mock RSVP creation
      const mockRSVPResult = {
        rows: [{
          id: 'rsvp-uuid',
          user_id: 'user-uuid',
          event_id: 'test-event-uuid',
          status: 'attending',
          created_at: new Date().toISOString()
        }]
      };

      // Mock updated attendance count
      const mockUpdatedAttendance = { rows: [{ count: '51' }] };

      pool.connect.mockResolvedValue({
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(mockEvent) // Event check
          .mockResolvedValueOnce(mockNoRSVP) // Current RSVP check
          .mockResolvedValueOnce(mockAttendance) // Attendance count
          .mockResolvedValueOnce(mockRSVPResult) // RSVP creation
          .mockResolvedValueOnce(mockUpdatedAttendance) // Updated attendance
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      });

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRSVPData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.rsvp_id).toBe('rsvp-uuid');
    });

    test('should reject RSVP when event is at capacity', async () => {
      // Mock event at capacity
      const mockEvent = {
        rows: [{
          id: 'test-event-uuid',
          max_attendees: 100,
          is_active: true,
          date: '2024-12-31T18:00:00.000Z'
        }]
      };

      const mockNoRSVP = { rows: [] };
      const mockFullAttendance = { rows: [{ count: '100' }] };

      pool.connect.mockResolvedValue({
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(mockEvent) // Event check
          .mockResolvedValueOnce(mockNoRSVP) // Current RSVP check
          .mockResolvedValueOnce(mockFullAttendance) // Full attendance
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn()
      });

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRSVPData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('maximum capacity');
    });

    test('should reject RSVP for past event', async () => {
      const mockPastEvent = {
        rows: [{
          id: 'test-event-uuid',
          date: '2020-01-01T18:00:00.000Z',
          max_attendees: 100,
          is_active: true
        }]
      };

      pool.connect.mockResolvedValue({
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(mockPastEvent) // Event check
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn()
      });

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRSVPData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('past events');
    });
  });

  describe('GET /api/rsvps', () => {
    test('should return user RSVPs when no filters provided', async () => {
      const mockRSVPs = {
        rows: [
          {
            id: 'rsvp-1',
            status: 'attending',
            event_title: 'Test Event',
            created_at: new Date().toISOString()
          }
        ]
      };

      const mockCount = { rows: [{ total: 1 }] };

      pool.query
        .mockResolvedValueOnce(mockRSVPs)
        .mockResolvedValueOnce(mockCount);

      const response = await request(app)
        .get('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    test('should require organizer authorization for event RSVPs', async () => {
      const mockOrganizer = { rows: [{ organizer_id: 'different-user' }] };

      pool.query.mockResolvedValueOnce(mockOrganizer);

      const response = await request(app)
        .get('/api/rsvps?event_id=test-event-uuid')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Not authorized');
    });
  });

  describe('Edge Cases', () => {
    test('should handle database transaction rollback', async () => {
      pool.connect.mockResolvedValue({
        query: jest.fn().mockRejectedValue(new Error('Database error')),
        release: jest.fn()
      });

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ event_id: 'test-uuid', status: 'attending' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    test('should validate RSVP status values', async () => {
      const invalidRSVP = {
        event_id: 'test-event-uuid',
        status: 'invalid-status'
      };

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidRSVP);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });
});