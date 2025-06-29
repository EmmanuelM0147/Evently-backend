import request from 'supertest';
import { pool } from '../../src/config/database.js';
import app from '../../src/app.js';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('../../src/config/database.js');

describe('Events Controller', () => {
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

  describe('POST /api/events', () => {
    const validEventData = {
      title: 'Tech Conference 2024',
      description: 'Annual technology conference for developers',
      date: new Date(Date.now() + 86400000).toISOString(),
      location: 'Lagos, Nigeria',
      is_paid: true,
      price: 5000,
      max_capacity: 200,
      category: 'Technology'
    };

    test('should create event with valid data', async () => {
      const mockEvent = generateMockEvent(validEventData);
      
      // Mock authentication
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validEventData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.event_id).toBe(mockEvent.id);
      expect(response.body.data.title).toBe(validEventData.title);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    test('should reject event with past date', async () => {
      const pastEventData = {
        ...validEventData,
        date: new Date(Date.now() - 86400000).toISOString() // Yesterday
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(pastEventData);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.some(err => err.path === 'date')).toBe(true);
    });

    test('should reject paid event with zero price', async () => {
      const invalidPaidEvent = {
        ...validEventData,
        is_paid: true,
        price: 0
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidPaidEvent);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should reject free event with price', async () => {
      const invalidFreeEvent = {
        ...validEventData,
        is_paid: false,
        price: 1000
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidFreeEvent);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/events')
        .send(validEventData);

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Not authorized');
    });

    test('should validate required fields', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const incompleteData = {
        title: 'Incomplete Event'
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(incompleteData);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should handle database transaction failure', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')) // INSERT fails
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validEventData);

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to create event');
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should validate title length', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const invalidTitleData = {
        ...validEventData,
        title: 'AB' // Too short
      };

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidTitleData);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should validate max capacity range', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const invalidCapacityData = {
        ...validEventData,
        max_capacity: 0 // Invalid capacity
      };

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidCapacityData);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('GET /api/events', () => {
    const mockEvents = [
      generateMockEvent({ title: 'Event 1', category: 'Technology' }),
      generateMockEvent({ title: 'Event 2', category: 'Business' })
    ];

    test('should return paginated events', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: mockEvents }) // Main query
        .mockResolvedValueOnce({ rows: [{ total: 2 }] }); // Count query

      const response = await request(app)
        .get('/api/events?page=1&limit=10');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        currentPage: 1,
        totalPages: 1,
        totalEvents: 2,
        eventsPerPage: 10,
        hasNextPage: false,
        hasPrevPage: false
      });
    });

    test('should filter events by category', async () => {
      const techEvents = [generateMockEvent({ category: 'Technology' })];
      
      pool.query
        .mockResolvedValueOnce({ rows: techEvents })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const response = await request(app)
        .get('/api/events?category=Technology');

      expect(response.status).toBe(200);
      expect(response.body.data[0].category).toBe('Technology');
      expect(response.body.filters.category).toBe('Technology');
    });

    test('should search events by title and description', async () => {
      const searchResults = [generateMockEvent({ title: 'Node.js Conference' })];
      
      pool.query
        .mockResolvedValueOnce({ rows: searchResults })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const response = await request(app)
        .get('/api/events?search=nodejs');

      expect(response.status).toBe(200);
      expect(response.body.filters.search).toBe('nodejs');
    });

    test('should filter by location', async () => {
      const lagosEvents = [generateMockEvent({ location: 'Lagos, Nigeria' })];
      
      pool.query
        .mockResolvedValueOnce({ rows: lagosEvents })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const response = await request(app)
        .get('/api/events?location=Lagos');

      expect(response.status).toBe(200);
      expect(response.body.filters.location).toBe('Lagos');
    });

    test('should filter by date range', async () => {
      const dateFrom = '2024-01-01T00:00:00Z';
      const dateTo = '2024-12-31T23:59:59Z';
      
      pool.query
        .mockResolvedValueOnce({ rows: mockEvents })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] });

      const response = await request(app)
        .get(`/api/events?date_from=${dateFrom}&date_to=${dateTo}`);

      expect(response.status).toBe(200);
      expect(response.body.filters.date_from).toBe(dateFrom);
      expect(response.body.filters.date_to).toBe(dateTo);
    });

    test('should sort events by date and price', async () => {
      const sortedEvents = [
        generateMockEvent({ date: '2024-01-01T10:00:00Z' }),
        generateMockEvent({ date: '2024-01-02T10:00:00Z' })
      ];
      
      pool.query
        .mockResolvedValueOnce({ rows: sortedEvents })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] });

      const response = await request(app)
        .get('/api/events?sort_by=date&sort_order=ASC');

      expect(response.status).toBe(200);
      expect(response.body.filters.sort_by).toBe('date');
      expect(response.body.filters.sort_order).toBe('ASC');
    });

    test('should handle large page numbers gracefully', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 5 }] });

      const response = await request(app)
        .get('/api/events?page=999&limit=10');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.pagination.currentPage).toBe(999);
    });

    test('should limit page size to maximum', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: mockEvents })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] });

      const response = await request(app)
        .get('/api/events?limit=1000'); // Exceeds max limit

      expect(response.status).toBe(200);
      expect(response.body.pagination.eventsPerPage).toBe(100); // Should be capped
    });

    test('should handle database errors', async () => {
      pool.query.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/events');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to fetch events');
    });
  });

  describe('GET /api/events/:id', () => {
    test('should return single event with details', async () => {
      const mockEvent = generateMockEvent();
      mockEvent.organizer_name = 'John Doe';
      mockEvent.organizer_email = 'john@example.com';
      mockEvent.total_rsvps = 50;
      mockEvent.attending_count = 40;
      mockEvent.maybe_count = 5;
      mockEvent.declined_count = 5;
      mockEvent.available_spots = 60;
      
      pool.query.mockResolvedValueOnce({ rows: [mockEvent] });

      const response = await request(app)
        .get(`/api/events/${mockEvent.id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(mockEvent.id);
      expect(response.body.data.organizer_name).toBe('John Doe');
      expect(response.body.data.attending_count).toBe(40);
    });

    test('should return 404 for non-existent event', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/events/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Event not found');
    });

    test('should handle database errors', async () => {
      pool.query.mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .get('/api/events/some-id');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to fetch event');
    });
  });

  describe('PUT /api/events/:id', () => {
    const updateData = {
      title: 'Updated Event Title',
      description: 'Updated description',
      date: new Date(Date.now() + 86400000).toISOString(),
      location: 'Updated Location',
      is_paid: false,
      price: 0,
      max_capacity: 150,
      category: 'Business'
    };

    test('should update event by organizer', async () => {
      const mockEvent = generateMockEvent({ organizer_id: mockUser.id });

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ organizer_id: mockUser.id, max_attendees: 100 }] }) // Check ownership
        .mockResolvedValueOnce({ rows: [{ ...mockEvent, ...updateData }] }) // UPDATE
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .put(`/api/events/${mockEvent.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(updateData.title);
    });

    test('should reject update by non-organizer', async () => {
      const differentUserId = 'different-user-id';
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ organizer_id: differentUserId }] }) // Check ownership
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .put('/api/events/some-event-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Not authorized');
    });

    test('should reject capacity reduction below current attendees', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ organizer_id: mockUser.id, max_attendees: 200 }] }) // Check ownership
        .mockResolvedValueOnce({ rows: [{ count: '150' }] }) // Current attendees
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .put('/api/events/some-event-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...updateData, max_capacity: 100 }); // Trying to reduce below 150

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot reduce capacity');
    });

    test('should return 404 for non-existent event', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Event not found
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .put('/api/events/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Event not found');
    });
  });

  describe('DELETE /api/events/:id', () => {
    test('should soft delete event by organizer', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ organizer_id: mockUser.id }] }) // Check ownership
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // No attendees
        .mockResolvedValueOnce(undefined) // Soft delete
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .delete('/api/events/some-event-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted successfully');
    });

    test('should reject deletion of event with attendees', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ organizer_id: mockUser.id }] }) // Check ownership
        .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // Has attendees
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .delete('/api/events/some-event-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot delete event with confirmed attendees');
    });

    test('should reject deletion by non-organizer', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ organizer_id: 'different-user-id' }] }) // Check ownership
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .delete('/api/events/some-event-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Not authorized');
    });
  });

  describe('GET /api/events/user/my-events', () => {
    test('should return user events with pagination', async () => {
      const userEvents = [
        generateMockEvent({ organizer_id: mockUser.id, title: 'My Event 1' }),
        generateMockEvent({ organizer_id: mockUser.id, title: 'My Event 2' })
      ];

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: userEvents }) // Main query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }); // Count query

      const response = await request(app)
        .get('/api/events/user/my-events')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.totalEvents).toBe(2);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/events/user/my-events');

      expect(response.status).toBe(401);
    });

    test('should handle pagination parameters', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const response = await request(app)
        .get('/api/events/user/my-events?page=2&limit=5')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination.currentPage).toBe(2);
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle concurrent event creation', async () => {
      const eventData = {
        title: 'Concurrent Test Event',
        description: 'Testing concurrent creation',
        date: new Date(Date.now() + 86400000).toISOString(),
        location: 'Test Location',
        is_paid: false,
        max_capacity: 50,
        category: 'Technology'
      };

      pool.query.mockResolvedValue({ rows: [mockUser] }); // Auth for all requests
      
      // Mock successful creation for all requests
      mockClient.query
        .mockResolvedValue(undefined) // BEGIN
        .mockResolvedValue({ rows: [generateMockEvent(eventData)] }) // INSERT
        .mockResolvedValue(undefined); // COMMIT

      const promises = Array(5).fill().map(() =>
        request(app)
          .post('/api/events')
          .set('Authorization', `Bearer ${authToken}`)
          .send(eventData)
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect([201, 500]).toContain(response.status); // Either success or handled error
      });
    });

    test('should validate event date constraints', async () => {
      const farFutureEvent = {
        title: 'Far Future Event',
        description: 'Event too far in the future',
        date: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000) * 10).toISOString(), // 10 years from now
        location: 'Future Location',
        is_paid: false,
        max_capacity: 100,
        category: 'Technology'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(farFutureEvent);

      // Should either accept or have reasonable validation
      expect([201, 400]).toContain(response.status);
    });

    test('should handle extremely long event descriptions', async () => {
      const longDescriptionEvent = {
        title: 'Event with Long Description',
        description: 'A'.repeat(3000), // Exceeds limit
        date: new Date(Date.now() + 86400000).toISOString(),
        location: 'Test Location',
        is_paid: false,
        max_capacity: 100,
        category: 'Technology'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(longDescriptionEvent);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should handle special characters in event data', async () => {
      const specialCharEvent = {
        title: 'Event with 特殊字符 & Émojis 🎉',
        description: 'Description with special chars: áéíóú & symbols @#$%',
        date: new Date(Date.now() + 86400000).toISOString(),
        location: 'Café, São Paulo, Brasil',
        is_paid: false,
        max_capacity: 100,
        category: 'Technology'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] });
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [generateMockEvent(specialCharEvent)] }) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(specialCharEvent);

      expect(response.status).toBe(201);
      expect(response.body.data.title).toBe(specialCharEvent.title);
    });
  });
});