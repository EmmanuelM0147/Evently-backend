import request from 'supertest';
import { pool } from '../../src/config/database.js';
import app from '../../src/app.js';
import jwt from 'jsonwebtoken';

jest.mock('../../src/config/database.js');

describe('RSVPs Integration Tests', () => {
  let authToken;
  let organizerToken;
  let mockUser;
  let mockOrganizer;
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = generateMockUser();
    mockOrganizer = generateMockUser();
    authToken = jwt.sign({ id: mockUser.id }, process.env.JWT_SECRET);
    organizerToken = jwt.sign({ id: mockOrganizer.id }, process.env.JWT_SECRET);
    
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Complete RSVP Workflow', () => {
    test('should complete full RSVP lifecycle', async () => {
      // Step 1: Create an event
      const eventData = {
        title: 'Integration Test Event',
        description: 'Test event for RSVP integration',
        date: new Date(Date.now() + 86400000).toISOString(),
        location: 'Test Location',
        is_paid: false,
        max_capacity: 100,
        category: 'Technology'
      };

      const mockEvent = generateMockEvent({
        ...eventData,
        organizer_id: mockOrganizer.id
      });

      pool.query.mockResolvedValueOnce({ rows: [mockOrganizer] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event creation
        .mockResolvedValueOnce(undefined); // COMMIT

      const eventResponse = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData);

      expect(eventResponse.status).toBe(201);
      const createdEvent = eventResponse.body.data;

      // Step 2: User RSVPs to the event
      const rsvpData = {
        event_id: createdEvent.id,
        status: 'attending'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing RSVP
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // Current attendance
        .mockResolvedValueOnce({ rows: [{ 
          id: 'rsvp-uuid',
          user_id: mockUser.id,
          event_id: createdEvent.id,
          status: 'attending',
          created_at: new Date().toISOString()
        }] }) // RSVP creation
        .mockResolvedValueOnce({ rows: [{ count: '11' }] }) // Updated attendance
        .mockResolvedValueOnce(undefined); // COMMIT

      const rsvpResponse = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send(rsvpData);

      expect(rsvpResponse.status).toBe(200);
      expect(rsvpResponse.body.data.status).toBe('attending');

      // Step 3: Organizer views event RSVPs
      pool.query.mockResolvedValueOnce({ rows: [mockOrganizer] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: [{ 
          organizer_id: mockOrganizer.id,
          title: mockEvent.title,
          max_attendees: 100
        }] }) // Event check
        .mockResolvedValueOnce({ rows: [{
          id: 'rsvp-uuid',
          status: 'attending',
          username: mockUser.username,
          email: mockUser.email
        }] }) // RSVPs
        .mockResolvedValueOnce({ rows: [{ status: 'attending', count: '1' }] }) // Summary
        .mockResolvedValueOnce({ rows: [{ total: 1 }] }); // Count

      const organizerRSVPResponse = await request(app)
        .get(`/api/rsvps/event/${createdEvent.id}`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(organizerRSVPResponse.status).toBe(200);
      expect(organizerRSVPResponse.body.data.rsvps).toHaveLength(1);
      expect(organizerRSVPResponse.body.data.summary.attending).toBe(1);

      // Step 4: User updates RSVP status
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [{ id: 'rsvp-uuid', status: 'attending' }] }) // Existing RSVP
        .mockResolvedValueOnce({ rows: [{ 
          id: 'rsvp-uuid',
          status: 'maybe',
          updated_at: new Date().toISOString()
        }] }) // RSVP update
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // Updated attendance
        .mockResolvedValueOnce(undefined); // COMMIT

      const updateResponse = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          event_id: createdEvent.id,
          status: 'maybe'
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.data.status).toBe('maybe');

      // Step 5: User views their RSVPs
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: [{
          id: 'rsvp-uuid',
          status: 'maybe',
          title: mockEvent.title,
          date: mockEvent.date,
          location: mockEvent.location,
          organizer_name: mockOrganizer.username
        }] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const userRSVPsResponse = await request(app)
        .get('/api/rsvps/my-rsvps')
        .set('Authorization', `Bearer ${authToken}`);

      expect(userRSVPsResponse.status).toBe(200);
      expect(userRSVPsResponse.body.data).toHaveLength(1);
      expect(userRSVPsResponse.body.data[0].status).toBe('maybe');
    });

    test('should handle RSVP capacity management', async () => {
      // Create event with limited capacity
      const limitedEvent = generateMockEvent({
        max_attendees: 2
      });

      // First user RSVPs successfully
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [limitedEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing RSVP
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // Current attendance
        .mockResolvedValueOnce({ rows: [{ 
          id: 'rsvp-1',
          status: 'attending'
        }] }) // RSVP creation
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // Updated attendance
        .mockResolvedValueOnce(undefined); // COMMIT

      const firstRSVP = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          event_id: limitedEvent.id,
          status: 'attending'
        });

      expect(firstRSVP.status).toBe(200);

      // Second user tries to RSVP but capacity is full
      const secondUser = generateMockUser();
      const secondToken = jwt.sign({ id: secondUser.id }, process.env.JWT_SECRET);

      pool.query.mockResolvedValueOnce({ rows: [secondUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [limitedEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [] }) // No existing RSVP
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // At capacity
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const secondRSVP = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${secondToken}`)
        .send({
          event_id: limitedEvent.id,
          status: 'attending'
        });

      expect(secondRSVP.status).toBe(400);
      expect(secondRSVP.body.error).toContain('maximum capacity');
    });

    test('should handle RSVP status transitions correctly', async () => {
      const mockEvent = generateMockEvent({ max_attendees: 100 });
      const existingRSVP = { id: 'rsvp-id', status: 'maybe' };

      // Test all valid status transitions
      const transitions = [
        { from: 'maybe', to: 'attending' },
        { from: 'attending', to: 'declined' },
        { from: 'declined', to: 'maybe' },
        { from: 'maybe', to: 'declined' }
      ];

      for (const transition of transitions) {
        pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

        mockClient.query
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
          .mockResolvedValueOnce({ rows: [{ ...existingRSVP, status: transition.from }] }) // Existing RSVP
          .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // Attendance
          .mockResolvedValueOnce({ rows: [{ 
            ...existingRSVP,
            status: transition.to
          }] }) // RSVP update
          .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // Updated attendance
          .mockResolvedValueOnce(undefined); // COMMIT

        const response = await request(app)
          .post('/api/rsvps')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            event_id: mockEvent.id,
            status: transition.to
          });

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe(transition.to);
      }
    });
  });

  describe('RSVP Authorization and Security', () => {
    test('should prevent unauthorized access to event RSVPs', async () => {
      const eventId = 'test-event-id';
      
      // User tries to access RSVPs for event they don't organize
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

    test('should allow users to delete their own RSVPs', async () => {
      const rsvpId = 'user-rsvp-id';

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ 
          user_id: mockUser.id,
          event_id: 'event-id'
        }] }) // RSVP ownership check
        .mockResolvedValueOnce(undefined) // DELETE
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .delete(`/api/rsvps/${rsvpId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('deleted successfully');
    });

    test('should prevent users from deleting other users RSVPs', async () => {
      const rsvpId = 'other-user-rsvp-id';

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ 
          user_id: 'different-user-id',
          event_id: 'event-id'
        }] }) // RSVP ownership check
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .delete(`/api/rsvps/${rsvpId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Not authorized');
    });
  });

  describe('RSVP Data Consistency', () => {
    test('should maintain accurate attendance counts', async () => {
      const mockEvent = generateMockEvent({ 
        max_attendees: 100,
        id: 'consistency-test-event'
      });

      // Multiple users RSVP to the same event
      const users = [mockUser, generateMockUser(), generateMockUser()];
      const tokens = users.map(user => jwt.sign({ id: user.id }, process.env.JWT_SECRET));

      let expectedCount = 10; // Starting attendance

      for (let i = 0; i < users.length; i++) {
        pool.query.mockResolvedValueOnce({ rows: [users[i]] }); // Auth

        mockClient.query
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
          .mockResolvedValueOnce({ rows: [] }) // No existing RSVP
          .mockResolvedValueOnce({ rows: [{ count: expectedCount.toString() }] }) // Current attendance
          .mockResolvedValueOnce({ rows: [{ 
            id: `rsvp-${i}`,
            status: 'attending'
          }] }) // RSVP creation
          .mockResolvedValueOnce({ rows: [{ count: (expectedCount + 1).toString() }] }) // Updated attendance
          .mockResolvedValueOnce(undefined); // COMMIT

        const response = await request(app)
          .post('/api/rsvps')
          .set('Authorization', `Bearer ${tokens[i]}`)
          .send({
            event_id: mockEvent.id,
            status: 'attending'
          });

        expect(response.status).toBe(200);
        expect(response.body.data.event_details.current_attendees).toBe(expectedCount + 1);
        expect(response.body.data.event_details.available_spots).toBe(100 - (expectedCount + 1));

        expectedCount++; // Increment for next iteration
      }
    });

    test('should handle RSVP status changes affecting counts', async () => {
      const mockEvent = generateMockEvent({ max_attendees: 100 });
      const existingRSVP = { id: 'rsvp-id', status: 'attending' };

      // User changes from attending to declined (should decrease attending count)
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
        .mockResolvedValueOnce({ rows: [existingRSVP] }) // Existing RSVP
        .mockResolvedValueOnce({ rows: [{ 
          ...existingRSVP,
          status: 'declined',
          updated_at: new Date().toISOString()
        }] }) // RSVP update
        .mockResolvedValueOnce({ rows: [{ count: '49' }] }) // Decreased attendance
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .post('/api/rsvps')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          event_id: mockEvent.id,
          status: 'declined'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('declined');
      expect(response.body.data.event_details.current_attendees).toBe(49);
      expect(response.body.data.event_details.available_spots).toBe(51);
    });
  });

  describe('RSVP Performance and Scalability', () => {
    test('should handle high volume of concurrent RSVPs', async () => {
      const mockEvent = generateMockEvent({ 
        max_attendees: 1000,
        id: 'high-volume-event'
      });

      const numberOfUsers = 50;
      const users = Array.from({ length: numberOfUsers }, () => generateMockUser());
      const tokens = users.map(user => jwt.sign({ id: user.id }, process.env.JWT_SECRET));

      // Mock successful RSVPs for all users
      users.forEach((user, index) => {
        pool.query.mockResolvedValueOnce({ rows: [user] }); // Auth

        mockClient.query
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [mockEvent] }) // Event check
          .mockResolvedValueOnce({ rows: [] }) // No existing RSVP
          .mockResolvedValueOnce({ rows: [{ count: (100 + index).toString() }] }) // Current attendance
          .mockResolvedValueOnce({ rows: [{ 
            id: `rsvp-${index}`,
            status: 'attending'
          }] }) // RSVP creation
          .mockResolvedValueOnce({ rows: [{ count: (101 + index).toString() }] }) // Updated attendance
          .mockResolvedValueOnce(undefined); // COMMIT
      });

      const promises = tokens.map(token =>
        request(app)
          .post('/api/rsvps')
          .set('Authorization', `Bearer ${token}`)
          .send({
            event_id: mockEvent.id,
            status: 'attending'
          })
      );

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();

      // All requests should complete successfully
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds
    });
  });
});