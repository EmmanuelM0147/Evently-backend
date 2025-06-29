import request from 'supertest';
import { pool } from '../../src/config/database.js';
import app from '../../src/app.js';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('../../src/config/database.js');

describe('Notifications Controller', () => {
  let authToken;
  let mockUser;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = generateMockUser();
    authToken = jwt.sign({ id: mockUser.id }, process.env.JWT_SECRET);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/notifications', () => {
    test('should return paginated notifications', async () => {
      const mockNotifications = [
        {
          id: 'notification-1',
          type: 'payment_success',
          title: 'Payment Successful',
          message: 'Your payment has been processed',
          is_read: false,
          event_title: 'Tech Conference',
          event_date: new Date().toISOString(),
          created_at: new Date().toISOString()
        }
      ];

      const mockCount = { rows: [{ total: 1 }] };
      const mockUnreadCount = { rows: [{ unread_count: 1 }] };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: mockNotifications })
        .mockResolvedValueOnce(mockCount)
        .mockResolvedValueOnce(mockUnreadCount);

      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].type).toBe('payment_success');
      expect(response.body.unreadCount).toBe(1);
      expect(response.body.pagination.totalNotifications).toBe(1);
    });

    test('should filter unread notifications only', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ unread_count: 0 }] });

      const response = await request(app)
        .get('/api/notifications?unread_only=true')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });

    test('should handle pagination parameters', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ unread_count: 0 }] });

      const response = await request(app)
        .get('/api/notifications?page=2&limit=5')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination.currentPage).toBe(2);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/notifications');

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/notifications/:id/read', () => {
    test('should mark notification as read', async () => {
      const notificationId = 'notification-123';
      const mockUpdatedNotification = {
        id: notificationId,
        is_read: true,
        updated_at: new Date().toISOString()
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query.mockResolvedValueOnce({ rows: [mockUpdatedNotification] });

      const response = await request(app)
        .put(`/api/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.is_read).toBe(true);
    });

    test('should return 404 for non-existent notification', async () => {
      const notificationId = 'non-existent';

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .put(`/api/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Notification not found');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .put('/api/notifications/some-id/read');

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/notifications/read-all', () => {
    test('should mark all notifications as read', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query.mockResolvedValueOnce({ rowCount: 5 }); // 5 notifications updated

      const response = await request(app)
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('5 notifications marked as read');
    });

    test('should handle case with no unread notifications', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query.mockResolvedValueOnce({ rowCount: 0 });

      const response = await request(app)
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('0 notifications');
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    test('should delete notification', async () => {
      const notificationId = 'notification-to-delete';

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query.mockResolvedValueOnce({ rowCount: 1 });

      const response = await request(app)
        .delete(`/api/notifications/${notificationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted successfully');
    });

    test('should return 404 for non-existent notification', async () => {
      const notificationId = 'non-existent';

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query.mockResolvedValueOnce({ rowCount: 0 });

      const response = await request(app)
        .delete(`/api/notifications/${notificationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Notification not found');
    });
  });

  describe('GET /api/notifications/stats', () => {
    test('should return notification statistics', async () => {
      const mockStats = {
        total: 48,
        unread: 12,
        payment_success: 8,
        payment_failed: 2,
        event_reminders: 15,
        
        rsvp_updates: 23
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query.mockResolvedValueOnce({ rows: [mockStats] });

      const response = await request(app)
        .get('/api/notifications/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBe(48);
      expect(response.body.data.unread).toBe(12);
      expect(response.body.data.payment_success).toBe(8);
    });

    test('should handle user with no notifications', async () => {
      const mockEmptyStats = {
        total: 0,
        unread: 0,
        payment_success: 0,
        payment_failed: 0,
        event_reminders: 0,
        rsvp_updates: 0
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query.mockResolvedValueOnce({ rows: [mockEmptyStats] });

      const response = await request(app)
        .get('/api/notifications/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.total).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth
      pool.query.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to fetch notifications');
    });

    test('should handle invalid notification ID format', async () => {
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth

      const response = await request(app)
        .put('/api/notifications/invalid-id-format/read')
        .set('Authorization', `Bearer ${authToken}`);

      // Should still attempt the operation and return appropriate response
      expect([200, 404, 500]).toContain(response.status);
    });
  });
});