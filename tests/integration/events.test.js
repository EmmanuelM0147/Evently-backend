import request from 'supertest';
import { pool } from '../../src/config/database.js';
import app from '../../src/app.js';
import jwt from 'jsonwebtoken';

jest.mock('../../src/config/database.js');

describe('Events Integration Tests', () => {
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

  describe('Complete Event Lifecycle', () => {
    test('should complete full event management workflow', async () => {
      // Step 1: Create an event
      const eventData = {
        title: 'Integration Test Conference',
        description: 'A comprehensive test of the event system',
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
        location: 'Test Convention Center, Lagos',
        is_paid: true,
        price: 15000,
        max_capacity: 500,
        category: 'Technology'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [generateMockEvent(eventData)] }) // Event creation
        .mockResolvedValueOnce(undefined); // COMMIT

      const createResponse = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(eventData);

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.data.title).toBe(eventData.title);
      expect(createResponse.body.data.price).toBe(eventData.price);

      const eventId = createResponse.body.data.event_id;

      // Step 2: Retrieve the created event
      const mockEventWithDetails = {
        ...generateMockEvent(eventData),
        id: eventId,
        organizer_name: mockUser.username,
        organizer_email: mockUser.email,
        total_rsvps: 0,
        attending_count: 0,
        maybe_count: 0,
        declined_count: 0,
        available_spots: 500
      };

      pool.query.mockResolvedValueOnce({ rows: [mockEventWithDetails] });

      const getResponse = await request(app)
        .get(`/api/events/${eventId}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data.id).toBe(eventId);
      expect(getResponse.body.data.organizer_name).toBe(mockUser.username);

      // Step 3: Update the event
      const updateData = {
        title: 'Updated Integration Test Conference',
        description: 'Updated description for the test event',
        date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks from now
        location: 'Updated Test Convention Center, Abuja',
        is_paid: true,
        price: 20000,
        max_capacity: 600,
        category: 'Business'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ organizer_id: mockUser.id, max_attendees: 500 }] }) // Ownership check
        .mockResolvedValueOnce({ rows: [generateMockEvent(updateData)] }) // Event update
        .mockResolvedValueOnce(undefined); // COMMIT

      const updateResponse = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.data.title).toBe(updateData.title);
      expect(updateResponse.body.data.price).toBe(updateData.price);

      // Step 4: List user's events
      const userEvents = [generateMockEvent({ 
        ...updateData, 
        organizer_id: mockUser.id,
        total_rsvps: 5,
        attending_count: 3
      })];

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: userEvents }) // User events
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // Count

      const userEventsResponse = await request(app)
        .get('/api/events/user/my-events')
        .set('Authorization', `Bearer ${authToken}`);

      expect(userEventsResponse.status).toBe(200);
      expect(userEventsResponse.body.data).toHaveLength(1);
      expect(userEventsResponse.body.data[0].attending_count).toBe(3);

      // Step 5: Search and filter events
      const searchEvents = [userEvents[0]];

      pool.query
        .mockResolvedValueOnce({ rows: searchEvents })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const searchResponse = await request(app)
        .get('/api/events?search=Integration&category=Business&location=Abuja');

      expect(searchResponse.status).toBe(200);
      expect(searchResponse.body.data).toHaveLength(1);
      expect(searchResponse.body.filters.search).toBe('Integration');
      expect(searchResponse.body.filters.category).toBe('Business');
    });

    test('should handle event creation with various configurations', async () => {
      const testCases = [
        {
          name: 'Free Event',
          data: {
            title: 'Free Community Meetup',
            description: 'A free event for the community',
            date: new Date(Date.now() + 86400000).toISOString(),
            location: 'Community Center',
            is_paid: false,
            price: 0,
            max_capacity: 50,
            category: 'Community'
          }
        },
        {
          name: 'Premium Event',
          data: {
            title: 'Premium Workshop',
            description: 'An expensive premium workshop',
            date: new Date(Date.now() + 86400000).toISOString(),
            location: 'Luxury Venue',
            is_paid: true,
            price: 100000,
            max_capacity: 20,
            category: 'Education'
          }
        },
        {
          name: 'Large Scale Event',
          data: {
            title: 'Music Festival',
            description: 'Large scale music festival',
            date: new Date(Date.now() + 86400000).toISOString(),
            location: 'Stadium',
            is_paid: true,
            price: 5000,
            max_capacity: 10000,
            category: 'Entertainment'
          }
        }
      ];

      for (const testCase of testCases) {
        pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

        mockClient.query
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [generateMockEvent(testCase.data)] }) // Event creation
          .mockResolvedValueOnce(undefined); // COMMIT

        const response = await request(app)
          .post('/api/events')
          .set('Authorization', `Bearer ${authToken}`)
          .send(testCase.data);

        expect(response.status).toBe(201);
        expect(response.body.data.title).toBe(testCase.data.title);
        expect(response.body.data.is_paid).toBe(testCase.data.is_paid);
        expect(response.body.data.price).toBe(testCase.data.price);
      }
    });
  });

  describe('Event Search and Filtering', () => {
    test('should support complex search and filter combinations', async () => {
      const mockEvents = [
        generateMockEvent({ 
          title: 'React Conference 2024',
          category: 'Technology',
          location: 'Lagos, Nigeria',
          price: 25000,
          date: '2024-06-15T09:00:00Z'
        }),
        generateMockEvent({ 
          title: 'Vue.js Workshop',
          category: 'Technology', 
          location: 'Abuja, Nigeria',
          price: 15000,
          date: '2024-07-20T14:00:00Z'
        }),
        generateMockEvent({ 
          title: 'Business Summit',
          category: 'Business',
          location: 'Lagos, Nigeria', 
          price: 50000,
          date: '2024-08-10T10:00:00Z'
        })
      ];

      // Test 1: Search by technology category in Lagos
      pool.query
        .mockResolvedValueOnce({ rows: [mockEvents[0]] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const techLagosResponse = await request(app)
        .get('/api/events?category=Technology&location=Lagos');

      expect(techLagosResponse.status).toBe(200);
      expect(techLagosResponse.body.data).toHaveLength(1);
      expect(techLagosResponse.body.data[0].title).toBe('React Conference 2024');

      // Test 2: Search by keyword with date range
      pool.query
        .mockResolvedValueOnce({ rows: [mockEvents[0], mockEvents[1]] })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] });

      const keywordDateResponse = await request(app)
        .get('/api/events?search=React Vue&date_from=2024-06-01&date_to=2024-07-31');

      expect(keywordDateResponse.status).toBe(200);
      expect(keywordDateResponse.body.data).toHaveLength(2);

      // Test 3: Sort by price with category filter
      pool.query
        .mockResolvedValueOnce({ rows: [mockEvents[1], mockEvents[0]] }) // Sorted by price ASC
        .mockResolvedValueOnce({ rows: [{ total: 2 }] });

      const sortedPriceResponse = await request(app)
        .get('/api/events?category=Technology&sort_by=price&sort_order=ASC');

      expect(sortedPriceResponse.status).toBe(200);
      expect(sortedPriceResponse.body.filters.sort_by).toBe('price');
      expect(sortedPriceResponse.body.filters.sort_order).toBe('ASC');
    });

    test('should handle pagination with large datasets', async () => {
      // Generate mock events for pagination testing
      const totalEvents = 150;
      const pageSize = 10;
      const currentPage = 5;

      const mockPageEvents = Array.from({ length: pageSize }, (_, index) => 
        generateMockEvent({ 
          title: `Event ${(currentPage - 1) * pageSize + index + 1}`,
          category: 'Technology'
        })
      );

      pool.query
        .mockResolvedValueOnce({ rows: mockPageEvents })
        .mockResolvedValueOnce({ rows: [{ total: totalEvents }] });

      const response = await request(app)
        .get(`/api/events?page=${currentPage}&limit=${pageSize}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(pageSize);
      expect(response.body.pagination).toEqual({
        currentPage: currentPage,
        totalPages: Math.ceil(totalEvents / pageSize),
        totalEvents: totalEvents,
        eventsPerPage: pageSize,
        hasNextPage: true,
        hasPrevPage: true
      });
    });

    test('should handle edge cases in search parameters', async () => {
      const testCases = [
        {
          name: 'Empty search results',
          query: '?search=NonexistentEvent',
          mockData: { rows: [] },
          mockCount: { rows: [{ total: 0 }] }
        },
        {
          name: 'Special characters in search',
          query: '?search=React & Vue.js Conference 2024!',
          mockData: { rows: [generateMockEvent({ title: 'React & Vue.js Conference 2024!' })] },
          mockCount: { rows: [{ total: 1 }] }
        },
        {
          name: 'Invalid page number',
          query: '?page=-1',
          mockData: { rows: [] },
          mockCount: { rows: [{ total: 0 }] }
        },
        {
          name: 'Large page size',
          query: '?limit=1000',
          mockData: { rows: [] },
          mockCount: { rows: [{ total: 0 }] }
        }
      ];

      for (const testCase of testCases) {
        pool.query
          .mockResolvedValueOnce(testCase.mockData)
          .mockResolvedValueOnce(testCase.mockCount);

        const response = await request(app)
          .get(`/api/events${testCase.query}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual(testCase.mockData.rows);
      }
    });
  });

  describe('Event Access Control and Security', () => {
    test('should enforce proper authorization for event management', async () => {
      const eventId = 'test-event-id';
      const otherUserId = 'other-user-id';

      // Test update authorization
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ organizer_id: otherUserId }] }) // Ownership check (fails)
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const updateResponse = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Unauthorized Update',
          description: 'Should not work',
          date: new Date(Date.now() + 86400000).toISOString(),
          location: 'Unauthorized Location',
          is_paid: false,
          max_capacity: 100,
          category: 'Technology'
        });

      expect(updateResponse.status).toBe(403);
      expect(updateResponse.body.error).toContain('Not authorized');

      // Test delete authorization
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ organizer_id: otherUserId }] }) // Ownership check (fails)
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const deleteResponse = await request(app)
        .delete(`/api/events/${eventId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(403);
      expect(deleteResponse.body.error).toContain('Not authorized');
    });

    test('should prevent deletion of events with attendees', async () => {
      const eventId = 'event-with-attendees';

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ organizer_id: mockUser.id }] }) // Ownership check (passes)
        .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // Has attendees
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const response = await request(app)
        .delete(`/api/events/${eventId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot delete event with confirmed attendees');
    });

    test('should validate input data thoroughly', async () => {
      const invalidEventData = [
        {
          name: 'Missing required fields',
          data: { title: 'Incomplete Event' },
          expectedError: 'validation'
        },
        {
          name: 'Invalid date format',
          data: {
            title: 'Bad Date Event',
            description: 'Event with bad date',
            date: 'invalid-date',
            location: 'Test Location',
            is_paid: false,
            max_capacity: 100,
            category: 'Technology'
          },
          expectedError: 'validation'
        },
        {
          name: 'Past date',
          data: {
            title: 'Past Event',
            description: 'Event in the past',
            date: new Date(Date.now() - 86400000).toISOString(),
            location: 'Test Location',
            is_paid: false,
            max_capacity: 100,
            category: 'Technology'
          },
          expectedError: 'validation'
        },
        {
          name: 'Paid event without price',
          data: {
            title: 'Paid Event',
            description: 'Paid event without price',
            date: new Date(Date.now() + 86400000).toISOString(),
            location: 'Test Location',
            is_paid: true,
            price: 0,
            max_capacity: 100,
            category: 'Technology'
          },
          expectedError: 'validation'
        }
      ];

      for (const testCase of invalidEventData) {
        pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

        const response = await request(app)
          .post('/api/events')
          .set('Authorization', `Bearer ${authToken}`)
          .send(testCase.data);

        expect(response.status).toBe(400);
        expect(response.body.errors || response.body.error).toBeDefined();
      }
    });
  });

  describe('Event Performance and Scalability', () => {
    test('should handle concurrent event creation', async () => {
      const numberOfEvents = 10;
      const eventPromises = [];

      for (let i = 0; i < numberOfEvents; i++) {
        const eventData = {
          title: `Concurrent Event ${i + 1}`,
          description: `Description for event ${i + 1}`,
          date: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
          location: `Location ${i + 1}`,
          is_paid: i % 2 === 0, // Alternate between paid and free
          price: i % 2 === 0 ? (i + 1) * 1000 : 0,
          max_capacity: 100 + i * 10,
          category: ['Technology', 'Business', 'Education'][i % 3]
        };

        // Mock database operations for each event
        pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

        mockClient.query
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [generateMockEvent(eventData)] }) // Event creation
          .mockResolvedValueOnce(undefined); // COMMIT

        eventPromises.push(
          request(app)
            .post('/api/events')
            .set('Authorization', `Bearer ${authToken}`)
            .send(eventData)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(eventPromises);
      const endTime = Date.now();

      // All events should be created successfully
      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        expect(response.body.data.title).toBe(`Concurrent Event ${index + 1}`);
      });

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(3000); // 3 seconds
    });

    test('should efficiently handle large event lists', async () => {
      const largeEventSet = Array.from({ length: 100 }, (_, index) => 
        generateMockEvent({
          title: `Event ${index + 1}`,
          category: ['Technology', 'Business', 'Education', 'Entertainment'][index % 4],
          location: ['Lagos', 'Abuja', 'Port Harcourt', 'Kano'][index % 4],
          price: Math.floor(Math.random() * 50000),
          attending_count: Math.floor(Math.random() * 100)
        })
      );

      pool.query
        .mockResolvedValueOnce({ rows: largeEventSet.slice(0, 50) }) // First page
        .mockResolvedValueOnce({ rows: [{ total: 100 }] }); // Total count

      const startTime = Date.now();
      const response = await request(app)
        .get('/api/events?page=1&limit=50');
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(50);
      expect(response.body.pagination.totalEvents).toBe(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should be fast
    });
  });
});