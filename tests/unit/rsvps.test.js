import request from 'supertest';
import { pool } from '../../src/config/database.js';
import app from '../../src/app.js';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('../../src/config/database.js');

describe('RSVPs Controller', () => {
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

  describe('POST /api/rsvps', () => {
    const validRSVPData = {
      event_id: 'test-event-uuid',
      status: 'attending'
    };

    test('should create RSVP for available event', async () => {
      const mockEvent = generateMockEvent({
        id: validRSVPData.event_id,
        max_attendees: 100,
        date: new Date(Date.now() + 86400000).toISOString()
      });

      // Mock authentication
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing RSVP
        .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // Current attendance
        .mockResolvedValueOnce({ rows: [{ 
          id: 'rsvp-uuid',
          user_id: mockUser.id,
          event_id: validRSVPData.event_id,
          status: 'attending',
          created_at: new Date().toISOString()
        }] }) // RSVP creation
        .mockResolvedValueOnce({ rows: [{ count: '51' }] }) // Updated attendance
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRSVPData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('attending');
      expect(response.body.data.event_details.available_spots).toBe(49);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    test('should update existing RSVP', async () => {
      const mockEvent = generateMockEvent({
        id: validRSVPData.event_id,
        max_attendees: 100,
        date: new Date(Date.now() + 86400000).toISOString()
      });

      const existingRSVP = {
        id: 'existing-rsvp-id',
        status: 'maybe'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [existingRSVP] }) // Existing RSVP
        .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // Current attendance
        .mockResolvedValueOnce({ rows: [{ 
          ...existingRSVP,
          status: 'attending',
          updated_at: new Date().toISOString()
        }] }) // RSVP update
        .mockResolvedValueOnce({ rows: [{ count: '51' }] }) // Updated attendance
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRSVPData);

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('attending');
    });

    test('should reject RSVP when event is at capacity', async () => {
      const mockEvent = generateMockEvent({
        id: validRSVPData.event_id,
        max_attendees: 100,
        date: new Date(Date.now() + 86400000).toISOString()
      });

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing RSVP
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // At capacity
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRSVPData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('maximum capacity');
      expect(response.body.available_spots).toBe(0);
    });

    test('should reject RSVP for past event', async () => {
      const mockEvent = generateMockEvent({
        id: validRSVPData.event_id,
        date: new Date(Date.now() - 86400000).toISOString() // Yesterday
      });

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRSVPData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('past events');
    });

    test('should reject RSVP for inactive event', async () => {
      const mockEvent = generateMockEvent({
        id: validRSVPData.event_id,
        is_active: false
      });

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Event not found (inactive)
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRSVPData);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Event not found');
    });

    test('should validate RSVP status values', async () => {
      const invalidStatusData = {
        event_id: 'test-event-uuid',
        status: 'invalid-status'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidStatusData);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.some(err => err.path === 'status')).toBe(true);
    });

    test('should require valid event_id format', async () => {
      const invalidEventIdData = {
        event_id: 'invalid-uuid-format',
        status: 'attending'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidEventIdData);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/rsvps')
        .send(validRSVPData);

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Not authorized');
    });

    test('should handle database transaction failure', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')) // Event check fails
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRSVPData);

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to process RSVP');
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should handle concurrent RSVP attempts for limited capacity', async () => {
      const mockEvent = generateMockEvent({
        id: validRSVPData.event_id,
        max_attendees: 1, // Only 1 spot available
        date: new Date(Date.now() + 86400000).toISOString()
      });

      pool.query.mockResolvedValue({ rows: [mockUser] }); // Auth for both requests

      // First request succeeds, second should fail due to capacity
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing RSVP
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // No current attendance
        .mockResolvedValueOnce({ rows: [{ 
          id: 'rsvp-uuid-1',
          status: 'attending'
        }] }) // RSVP creation
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // Updated attendance
        .mockResolvedValueOnce(undefined) // COMMIT
        // Second request
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing RSVP
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // At capacity now
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const promises = [
        request(app)
          .post('/api/rsvps')
          .set('Authorization', `Bearer ${authToken}`)
          .send(validRSVPData),
        request(app)
          .post('/api/rsvps')
          .set('Authorization', `Bearer ${authToken}`)
          .send(validRSVPData)
      ];

      const responses = await Promise.all(promises);
      
      // One should succeed, one should fail
      const successCount = responses.filter(r => r.status === 200).length;
      const failCount = responses.filter(r => r.status === 400).length;
      
      expect(successCount).toBe(1);
      expect(failCount).toBe(1);
    });

    test('should handle status change from attending to declined', async () => {
      const mockEvent = generateMockEvent({
        id: validRSVPData.event_id,
        max_attendees: 100,
        date: new Date(Date.now() + 86400000).toISOString()
      });

      const existingAttendingRSVP = {
        id: 'existing-rsvp-id',
        status: 'attending'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [existingAttendingRSVP] }) // Existing RSVP
        .mockResolvedValueOnce({ rows: [{ 
          ...existingAttendingRSVP,
          status: 'declined',
          updated_at: new Date().toISOString()
        }] }) // RSVP update
        .mockResolvedValueOnce({ rows: [{ count: '49' }] }) // Updated attendance (decreased)
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          event_id: validRSVPData.event_id,
          status: 'declined'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('declined');
    });
  });

  describe('GET /api/rsvps', () => {
    test('should return user RSVPs when no filters provided', async () => {
      const mockRSVPs = [
        {
          id: 'rsvp-1',
          user_id: mockUser.id,
          event_id: 'event-1',
          status: 'attending',
          created_at: new Date().toISOString()
        }
      ];

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: mockRSVPs })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const response = await request(app)
        .get('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.totalRSVPs).toBe(1);
    });

    test('should require organizer authorization for event RSVPs', async () => {
      const eventId = 'test-event-id';
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      // Mock user is not the organizer
      pool.query.mockResolvedValueOnce({ 
        rows: [{ organizer_id: 'different-user-id' }] 
      });

      const response = await request(app)
        .get(`/api/rsvps?event_id=${eventId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Not authorized');
    });

    test('should allow event organizer to view event RSVPs', async () => {
      const eventId = 'test-event-id';
      const mockRSVPs = [
        {
          id: 'rsvp-1',
          event_id: eventId,
          status: 'attending'
        }
      ];
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      // Mock user is the organizer
      pool.query
        .mockResolvedValueOnce({ rows: [{ organizer_id: mockUser.id }] })
        .mockResolvedValueOnce({ rows: mockRSVPs })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const response = await request(app)
        .get(`/api/rsvps?event_id=${eventId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });

    test('should filter RSVPs by status', async () => {
      const mockAttendingRSVPs = [
        {
          id: 'rsvp-1',
          status: 'attending'
        }
      ];
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: mockAttendingRSVPs })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const response = await request(app)
        .get('/api/rsvps?status=attending')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.filters.status).toBe('attending');
    });

    test('should include event details when requested', async () => {
      const mockRSVPsWithDetails = [
        {
          id: 'rsvp-1',
          status: 'attending',
          event_title: 'Test Event',
          event_date: new Date().toISOString()
        }
      ];
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: mockRSVPsWithDetails })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const response = await request(app)
        .get('/api/rsvps?include_event_details=true')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data[0].event_title).toBeDefined();
    });

    test('should handle pagination parameters', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const response = await request(app)
        .get('/api/rsvps?page=2&limit=5')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination.currentPage).toBe(2);
      expect(response.body.pagination.rsvpsPerPage).toBe(5);
    });

    test('should limit page size to maximum', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const response = await request(app)
        .get('/api/rsvps?limit=1000') // Exceeds max
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination.rsvpsPerPage).toBe(100); // Should be capped
    });
  });

  describe('GET /api/rsvps/my-rsvps', () => {
    test('should return user RSVPs with event details', async () => {
      const mockUserRSVPs = [
        {
          id: 'rsvp-1',
          status: 'attending',
          title: 'Tech Conference',
          date: new Date(Date.now() + 86400000).toISOString(),
          location: 'Lagos, Nigeria',
          organizer_name: 'Event Organizer',
          current_attendees: 50
        }
      ];

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: mockUserRSVPs })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const response = await request(app)
        .get('/api/rsvps/my-rsvps')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Tech Conference');
      expect(response.body.data[0].organizer_name).toBe('Event Organizer');
    });

    test('should filter upcoming events only by default', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const response = await request(app)
        .get('/api/rsvps/my-rsvps')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.filters.upcoming_only).toBe(true);
    });

    test('should allow including past events', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const response = await request(app)
        .get('/api/rsvps/my-rsvps?upcoming_only=false')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.filters.upcoming_only).toBe(false);
    });

    test('should filter by RSVP status', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const response = await request(app)
        .get('/api/rsvps/my-rsvps?status=attending')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.filters.status).toBe('attending');
    });
  });

  describe('GET /api/rsvps/event/:eventId', () => {
    test('should return event RSVPs for organizer', async () => {
      const eventId = 'test-event-id';
      const mockEventRSVPs = [
        {
          id: 'rsvp-1',
          status: 'attending',
          username: 'attendee1',
          email: 'attendee1@test.com'
        },
        {
          id: 'rsvp-2',
          status: 'maybe',
          username: 'attendee2',
          email: 'attendee2@test.com'
        }
      ];

      const mockSummary = [
        { status: 'attending', count: '1' },
        { status: 'maybe', count: '1' }
      ];

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      // Mock organizer check
      pool.query
        .mockResolvedValueOnce({ rows: [{ 
          organizer_id: mockUser.id,
          title: 'Test Event',
          max_attendees: 100
        }] })
        .mockResolvedValueOnce({ rows: mockEventRSVPs })
        .mockResolvedValueOnce({ rows: mockSummary })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] });

      const response = await request(app)
        .get(`/api/rsvps/event/${eventId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.rsvps).toHaveLength(2);
      expect(response.body.data.summary.attending).toBe(1);
      expect(response.body.data.summary.maybe).toBe(1);
      expect(response.body.data.event_info.available_spots).toBe(99);
    });

    test('should reject non-organizer access', async () => {
      const eventId = 'test-event-id';
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query.mockResolvedValueOnce({ 
        rows: [{ organizer_id: 'different-user-id' }] 
      });

      const response = await request(app)
        .get(`/api/rsvps/event/${eventId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Not authorized');
    });

    test('should return 404 for non-existent event', async () => {
      const eventId = 'non-existent-event';
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query.mockResolvedValueOnce({ rows: [] }); // Event not found

      const response = await request(app)
        .get(`/api/rsvps/event/${eventId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Event not found');
    });

    test('should filter RSVPs by status', async () => {
      const eventId = 'test-event-id';
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: [{ 
          organizer_id: mockUser.id,
          title: 'Test Event',
          max_attendees: 100
        }] })
        .mockResolvedValueOnce({ rows: [] }) // Filtered RSVPs
        .mockResolvedValueOnce({ rows: [] }) // Summary
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const response = await request(app)
        .get(`/api/rsvps/event/${eventId}?status=attending`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('DELETE /api/rsvps/:id', () => {
    test('should delete user RSVP', async () => {
      const rsvpId = 'rsvp-to-delete';
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ 
          user_id: mockUser.id,
          event_id: 'event-id'
        }] }) // RSVP check
        .mockResolvedValueOnce(undefined) // DELETE
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .delete(`/api/rsvps/${rsvpId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted successfully');
    });

    test('should reject deletion of other user RSVP', async () => {
      const rsvpId = 'rsvp-to-delete';
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ 
          user_id: 'different-user-id',
          event_id: 'event-id'
        }] }) // RSVP check
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .delete(`/api/rsvps/${rsvpId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Not authorized');
    });

    test('should handle non-existent RSVP deletion', async () => {
      const rsvpId = 'non-existent-rsvp';
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // RSVP not found
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .delete(`/api/rsvps/${rsvpId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('RSVP not found');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .delete('/api/rsvps/some-rsvp-id');

      expect(response.status).toBe(401);
    });
  });

  describe('RSVP Business Logic Edge Cases', () => {
    test('should handle rapid status changes', async () => {
      const mockEvent = generateMockEvent({
        id: 'test-event-uuid',
        max_attendees: 100,
        date: new Date(Date.now() + 86400000).toISOString()
      });

      const existingRSVP = { id: 'rsvp-id', status: 'maybe' };

      pool.query.mockResolvedValue({ rows: [mockUser] }); // Auth for all requests

      // Mock rapid status changes
      const statuses = ['attending', 'declined', 'maybe', 'attending'];
      const promises = statuses.map(status => {
        mockClient.query
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
          .mockResolvedValueOnce({ rows: [existingRSVP] }) // Existing RSVP
          .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // Attendance
          .mockResolvedValueOnce({ rows: [{ ...existingRSVP, status }] }) // Update
          .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // Updated attendance
          .mockResolvedValueOnce(undefined); // COMMIT

        return request(app)
          .post('/api/rsvps')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ event_id: 'test-event-uuid', status });
      });

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect([200, 500]).toContain(response.status); // Either success or handled error
      });
    });

    test('should prevent duplicate RSVPs through unique constraint', async () => {
      const mockEvent = generateMockEvent({
        id: 'test-event-uuid',
        max_attendees: 100,
        date: new Date(Date.now() + 86400000).toISOString()
      });

      pool.query.mockResolvedValue({ rows: [mockUser] }); // Auth

      // Mock constraint violation
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing RSVP
        .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // Attendance
        .mockRejectedValueOnce({
          code: '23505', // PostgreSQL unique constraint violation
          constraint: 'rsvps_user_id_event_id_key'
        }) // Constraint violation
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ event_id: 'test-event-uuid', status: 'attending' });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to process RSVP');
    });

    test('should handle invalid event UUID format', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          event_id: 'not-a-valid-uuid',
          status: 'attending'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should maintain RSVP count consistency', async () => {
      const mockEvent = generateMockEvent({
        id: 'test-event-uuid',
        max_attendees: 100
      });

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing RSVP
        .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // Current attendance
        .mockResolvedValueOnce({ rows: [{ id: 'rsvp-id', status: 'attending' }] }) // RSVP creation
        .mockResolvedValueOnce({ rows: [{ count: '51' }] }) // Updated attendance (should increase by 1)
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ event_id: 'test-event-uuid', status: 'attending' });

      expect(response.status).toBe(200);
      expect(response.body.data.event_details.current_attendees).toBe(51);
      expect(response.body.data.event_details.available_spots).toBe(49);
    });
  });
});