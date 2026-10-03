import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { pool } from './database.js';

let io;

// Initialize WebSocket server
export const initializeWebSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  // Authentication middleware for WebSocket
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET, { audience: 'evently-admin' });
      
      // Get user from database
      const result = await pool.query(
        'SELECT id, email, username FROM users WHERE id = $1',
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = result.rows[0].id;
      socket.userEmail = result.rows[0].email;
      socket.username = result.rows[0].username;
      
      console.log(`🔌 User ${socket.username} (${socket.userId}) connected via WebSocket`);
      next();
    } catch (error) {
      console.error('WebSocket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Connection event handlers
  io.on('connection', (socket) => {
    // Join user to their personal room for targeted notifications
    socket.join(`user_${socket.userId}`);
    
    // Handle connection events
    socket.on('join_event', (eventId) => {
      socket.join(`event_${eventId}`);
      console.log(`📡 User ${socket.username} joined event ${eventId} room`);
    });

    socket.on('leave_event', (eventId) => {
      socket.leave(`event_${eventId}`);
      console.log(`📡 User ${socket.username} left event ${eventId} room`);
    });

    // Handle payment status requests
    socket.on('check_payment_status', async (paymentReference) => {
      try {
        const result = await pool.query(
          'SELECT status, amount, event_id FROM payments WHERE paystack_reference = $1 AND user_id = $2',
          [paymentReference, socket.userId]
        );

        if (result.rows.length > 0) {
          const payment = result.rows[0];
          socket.emit('payment_status_update', {
            reference: paymentReference,
            status: payment.status,
            amount: payment.amount,
            eventId: payment.event_id
          });
        }
      } catch (error) {
        console.error('Error checking payment status:', error);
        socket.emit('error', { message: 'Failed to check payment status' });
      }
    });

    // Handle notification acknowledgment
    socket.on('mark_notification_read', async (notificationId) => {
      try {
        await pool.query(
          'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
          [notificationId, socket.userId]
        );
        
        socket.emit('notification_read_confirmed', { notificationId });
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`🔌 User ${socket.username} disconnected: ${reason}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Send initial notification count
    getUnreadNotificationCount(socket.userId).then(count => {
      socket.emit('notification_count_update', { count });
    });
  });

  console.log('🚀 WebSocket server initialized');
  return io;
};

// Get WebSocket instance
export const getWebSocketInstance = () => io;

// Notification helper functions
export const sendNotificationToUser = async (userId, notification) => {
  if (!io) return;

  try {
    // Store notification in database
    const result = await pool.query(
      `INSERT INTO notifications (user_id, event_id, payment_id, type, title, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        notification.eventId || null,
        notification.paymentId || null,
        notification.type,
        notification.title,
        notification.message,
        notification.metadata || null
      ]
    );

    const savedNotification = result.rows[0];

    // Send real-time notification
    io.to(`user_${userId}`).emit('new_notification', {
      id: savedNotification.id,
      type: savedNotification.type,
      title: savedNotification.title,
      message: savedNotification.message,
      metadata: savedNotification.metadata,
      createdAt: savedNotification.created_at,
      isRead: false
    });

    // Update notification count
    const count = await getUnreadNotificationCount(userId);
    io.to(`user_${userId}`).emit('notification_count_update', { count });

    console.log(`📨 Notification sent to user ${userId}: ${notification.title}`);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

export const sendNotificationToEvent = async (eventId, notification, excludeUserId = null) => {
  if (!io) return;

  try {
    // Get all users who RSVPed to the event
    const result = await pool.query(
      'SELECT DISTINCT user_id FROM rsvps WHERE event_id = $1 AND status = $2',
      [eventId, 'attending']
    );

    const userIds = result.rows
      .map(row => row.user_id)
      .filter(userId => userId !== excludeUserId);

    // Send notification to each user
    for (const userId of userIds) {
      await sendNotificationToUser(userId, {
        ...notification,
        eventId
      });
    }

    console.log(`📢 Event notification sent to ${userIds.length} users for event ${eventId}`);
  } catch (error) {
    console.error('Error sending event notification:', error);
  }
};

export const broadcastPaymentUpdate = (paymentReference, status, userId, metadata = {}) => {
  if (!io) return;

  io.to(`user_${userId}`).emit('payment_status_update', {
    reference: paymentReference,
    status,
    timestamp: new Date().toISOString(),
    ...metadata
  });

  console.log(`💳 Payment update broadcasted: ${paymentReference} - ${status}`);
};

// Helper function to get unread notification count
const getUnreadNotificationCount = async (userId) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting notification count:', error);
    return 0;
  }
};