import { createServer } from 'http';
import { Server } from 'socket.io';
import Client from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { pool } from '../../src/config/database.js';

// Mock database
jest.mock('../../src/config/database.js');

describe('WebSocket Integration Tests', () => {
  let httpServer;
  let io;
  let clientSocket;
  let serverSocket;
  let authToken;
  let mockUser;

  beforeAll((done) => {
    mockUser = generateMockUser();
    authToken = jwt.sign({ id: mockUser.id }, process.env.JWT_SECRET || 'test-secret');
    
    // Mock database for WebSocket authentication
    pool.query.mockResolvedValue({ rows: [mockUser] });
    
    // Create test server
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: {
        origin: "http://localhost:3000",
        credentials: true
      }
    });
    
    // Add authentication middleware
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');
        socket.userId = decoded.id;
        socket.username = mockUser.username;
        next();
      } catch (error) {
        next(new Error('Authentication error: Invalid token'));
      }
    });
    
    httpServer.listen(() => {
      const port = httpServer.address().port;
      clientSocket = new Client(`http://localhost:${port}`, {
        auth: { token: authToken }
      });
      
      io.on('connection', (socket) => {
        serverSocket = socket;
      });
      
      clientSocket.on('connect', done);
    });
  });

  afterAll((done) => {
    io.close();
    clientSocket.close();
    httpServer.close(done);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Connection and Authentication', () => {
    test('should authenticate with valid token', () => {
      expect(serverSocket).toBeDefined();
      expect(serverSocket.userId).toBe(mockUser.id);
      expect(serverSocket.username).toBe(mockUser.username);
    });

    test('should reject connection with invalid token', (done) => {
      const invalidClient = new Client(`http://localhost:${httpServer.address().port}`, {
        auth: { token: 'invalid-token' }
      });
      
      invalidClient.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication error');
        invalidClient.close();
        done();
      });
    });

    test('should reject connection without token', (done) => {
      const noTokenClient = new Client(`http://localhost:${httpServer.address().port}`);
      
      noTokenClient.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication error');
        noTokenClient.close();
        done();
      });
    });
  });

  describe('Event Room Management', () => {
    test('should join and leave event rooms', (done) => {
      const eventId = 'test-event-123';
      let joinReceived = false;
      
      // Setup server event handlers
      serverSocket.on('join_event', (receivedEventId) => {
        expect(receivedEventId).toBe(eventId);
        joinReceived = true;
        
        serverSocket.on('leave_event', (leftEventId) => {
          expect(leftEventId).toBe(eventId);
          expect(joinReceived).toBe(true);
          done();
        });
        
        // Leave the event room
        clientSocket.emit('leave_event', eventId);
      });
      
      // Join the event room
      clientSocket.emit('join_event', eventId);
    });

    test('should handle multiple event room operations', (done) => {
      const events = ['event-1', 'event-2', 'event-3'];
      let joinCount = 0;
      let leaveCount = 0;
      
      serverSocket.on('join_event', (eventId) => {
        expect(events).toContain(eventId);
        joinCount++;
        
        if (joinCount === events.length) {
          // Start leaving events
          events.forEach(id => clientSocket.emit('leave_event', id));
        }
      });
      
      serverSocket.on('leave_event', (eventId) => {
        expect(events).toContain(eventId);
        leaveCount++;
        
        if (leaveCount === events.length) {
          expect(joinCount).toBe(3);
          expect(leaveCount).toBe(3);
          done();
        }
      });
      
      // Join multiple events
      events.forEach(id => clientSocket.emit('join_event', id));
    });
  });

  describe('Real-time Notifications', () => {
    test('should receive new notifications', (done) => {
      const notification = {
        id: 'notif-123',
        type: 'payment_success',
        title: 'Payment Successful',
        message: 'Your payment has been processed successfully',
        metadata: { amount: 5000 },
        createdAt: new Date().toISOString(),
        isRead: false
      };
      
      clientSocket.on('new_notification', (data) => {
        expect(data.id).toBe(notification.id);
        expect(data.type).toBe(notification.type);
        expect(data.title).toBe(notification.title);
        expect(data.message).toBe(notification.message);
        expect(data.metadata.amount).toBe(5000);
        done();
      });
      
      // Simulate server sending notification
      serverSocket.emit('new_notification', notification);
    });

    test('should receive notification count updates', (done) => {
      const count = 7;
      
      clientSocket.on('notification_count_update', (data) => {
        expect(data.count).toBe(count);
        done();
      });
      
      serverSocket.emit('notification_count_update', { count });
    });

    test('should handle notification read confirmations', (done) => {
      const notificationId = 'notif-456';
      
      clientSocket.on('notification_read_confirmed', (data) => {
        expect(data.notificationId).toBe(notificationId);
        done();
      });
      
      // Mock database update for notification read
      pool.query.mockResolvedValueOnce({ rows: [] });
      
      serverSocket.on('mark_notification_read', (id) => {
        expect(id).toBe(notificationId);
        serverSocket.emit('notification_read_confirmed', { notificationId: id });
      });
      
      clientSocket.emit('mark_notification_read', notificationId);
    });
  });

  describe('Payment Status Updates', () => {
    test('should receive payment status updates', (done) => {
      const paymentData = {
        reference: 'test-payment-ref-123',
        status: 'success',
        amount: 15000,
        eventId: 'event-456',
        timestamp: new Date().toISOString()
      };
      
      clientSocket.on('payment_status_update', (data) => {
        expect(data.reference).toBe(paymentData.reference);
        expect(data.status).toBe(paymentData.status);
        expect(data.amount).toBe(paymentData.amount);
        expect(data.eventId).toBe(paymentData.eventId);
        done();
      });
      
      serverSocket.emit('payment_status_update', paymentData);
    });

    test('should handle payment status check requests', (done) => {
      const paymentReference = 'check-payment-ref-789';
      const mockPayment = {
        status: 'success',
        amount: 10000,
        event_id: 'event-789'
      };
      
      // Mock database query for payment status
      pool.query.mockResolvedValueOnce({ rows: [mockPayment] });
      
      clientSocket.on('payment_status_update', (data) => {
        expect(data.reference).toBe(paymentReference);
        expect(data.status).toBe(mockPayment.status);
        expect(data.amount).toBe(mockPayment.amount);
        expect(data.eventId).toBe(mockPayment.event_id);
        done();
      });
      
      serverSocket.on('check_payment_status', async (reference) => {
        expect(reference).toBe(paymentReference);
        
        // Simulate payment status check
        serverSocket.emit('payment_status_update', {
          reference: paymentReference,
          status: mockPayment.status,
          amount: mockPayment.amount,
          eventId: mockPayment.event_id
        });
      });
      
      clientSocket.emit('check_payment_status', paymentReference);
    });

    test('should handle payment verification workflow', (done) => {
      const paymentData = {
        reference: 'verify-ref-101',
        status: 'pending'
      };
      
      let updateCount = 0;
      const expectedUpdates = ['processing', 'success'];
      
      clientSocket.on('payment_status_update', (data) => {
        expect(data.reference).toBe(paymentData.reference);
        expect(data.status).toBe(expectedUpdates[updateCount]);
        
        updateCount++;
        if (updateCount === expectedUpdates.length) {
          done();
        }
      });
      
      // Simulate payment verification workflow
      setTimeout(() => {
        serverSocket.emit('payment_status_update', {
          reference: paymentData.reference,
          status: 'processing'
        });
      }, 100);
      
      setTimeout(() => {
        serverSocket.emit('payment_status_update', {
          reference: paymentData.reference,
          status: 'success'
        });
      }, 200);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle server errors gracefully', (done) => {
      const errorMessage = 'Test server error';
      
      clientSocket.on('error', (error) => {
        expect(error.message).toBe(errorMessage);
        done();
      });
      
      serverSocket.emit('error', { message: errorMessage });
    });

    test('should handle disconnection and reconnection', (done) => {
      let disconnected = false;
      let reconnected = false;
      
      clientSocket.on('disconnect', (reason) => {
        expect(reason).toBeDefined();
        disconnected = true;
      });
      
      clientSocket.on('connect', () => {
        if (disconnected && !reconnected) {
          reconnected = true;
          expect(disconnected).toBe(true);
          expect(reconnected).toBe(true);
          done();
        }
      });
      
      // Force disconnect and reconnect
      setTimeout(() => {
        clientSocket.disconnect();
        setTimeout(() => {
          clientSocket.connect();
        }, 100);
      }, 100);
    });

    test('should handle invalid event data', (done) => {
      const invalidData = null;
      
      serverSocket.on('join_event', (eventId) => {
        // Should not receive invalid data
        expect(eventId).not.toBeNull();
        expect(eventId).not.toBeUndefined();
        done();
      });
      
      // Try to send invalid data
      try {
        clientSocket.emit('join_event', invalidData);
        // Send valid data to complete the test
        clientSocket.emit('join_event', 'valid-event-id');
      } catch (error) {
        // Error is expected for invalid data
        clientSocket.emit('join_event', 'valid-event-id');
      }
    });

    test('should handle rapid successive events', (done) => {
      const eventCount = 50;
      let receivedCount = 0;
      
      clientSocket.on('new_notification', (data) => {
        receivedCount++;
        expect(data.id).toBe(`rapid-notif-${receivedCount}`);
        
        if (receivedCount === eventCount) {
          expect(receivedCount).toBe(eventCount);
          done();
        }
      });
      
      // Send rapid successive notifications
      for (let i = 1; i <= eventCount; i++) {
        setTimeout(() => {
          serverSocket.emit('new_notification', {
            id: `rapid-notif-${i}`,
            type: 'test',
            title: `Test ${i}`,
            message: `Message ${i}`
          });
        }, i * 10); // 10ms intervals
      }
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple simultaneous clients', (done) => {
      const clientCount = 10;
      const clients = [];
      const tokens = [];
      let connectedClients = 0;
      
      // Create multiple test clients
      for (let i = 0; i < clientCount; i++) {
        const testUser = generateMockUser();
        const testToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test-secret');
        tokens.push(testToken);
        
        // Mock database for each client
        pool.query.mockResolvedValue({ rows: [testUser] });
        
        const client = new Client(`http://localhost:${httpServer.address().port}`, {
          auth: { token: testToken }
        });
        
        client.on('connect', () => {
          connectedClients++;
          if (connectedClients === clientCount) {
            // All clients connected, now test broadcasting
            testBroadcast();
          }
        });
        
        clients.push(client);
      }
      
      function testBroadcast() {
        let messageCount = 0;
        const expectedMessage = {
          type: 'broadcast_test',
          message: 'Message to all clients'
        };
        
        clients.forEach((client, index) => {
          client.on('broadcast_message', (data) => {
            expect(data.type).toBe(expectedMessage.type);
            expect(data.message).toBe(expectedMessage.message);
            messageCount++;
            
            if (messageCount === clientCount) {
              // Clean up clients
              clients.forEach(c => c.close());
              done();
            }
          });
        });
        
        // Broadcast message to all clients
        io.emit('broadcast_message', expectedMessage);
      }
    });

    test('should maintain performance under load', (done) => {
      const messageCount = 1000;
      let receivedCount = 0;
      const startTime = Date.now();
      
      clientSocket.on('load_test_message', (data) => {
        receivedCount++;
        expect(data.index).toBe(receivedCount);
        
        if (receivedCount === messageCount) {
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          // Should handle 1000 messages in reasonable time (under 5 seconds)
          expect(duration).toBeLessThan(5000);
          expect(receivedCount).toBe(messageCount);
          done();
        }
      });
      
      // Send messages rapidly
      for (let i = 1; i <= messageCount; i++) {
        setImmediate(() => {
          serverSocket.emit('load_test_message', { index: i });
        });
      }
    });
  });
});