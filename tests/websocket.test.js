import { createServer } from 'http';
import { Server } from 'socket.io';
import Client from 'socket.io-client';
import jwt from 'jsonwebtoken';

describe('WebSocket Functionality', () => {
  let httpServer;
  let io;
  let clientSocket;
  let serverSocket;
  let authToken;

  beforeAll((done) => {
    // Create test server
    httpServer = createServer();
    io = new Server(httpServer);
    
    // Generate test auth token
    authToken = jwt.sign({ id: 'test-user-id' }, process.env.JWT_SECRET || 'test-secret');
    
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

  afterAll(() => {
    io.close();
    clientSocket.close();
    httpServer.close();
  });

  test('should authenticate with valid token', (done) => {
    expect(serverSocket).toBeDefined();
    expect(serverSocket.userId).toBe('test-user-id');
    done();
  });

  test('should join and leave event rooms', (done) => {
    const eventId = 'test-event-123';
    
    serverSocket.on('join_event', (receivedEventId) => {
      expect(receivedEventId).toBe(eventId);
      
      serverSocket.on('leave_event', (leftEventId) => {
        expect(leftEventId).toBe(eventId);
        done();
      });
      
      clientSocket.emit('leave_event', eventId);
    });
    
    clientSocket.emit('join_event', eventId);
  });

  test('should handle payment status updates', (done) => {
    const paymentData = {
      reference: 'test-payment-ref',
      status: 'success',
      amount: 5000
    };
    
    clientSocket.on('payment_status_update', (data) => {
      expect(data.reference).toBe(paymentData.reference);
      expect(data.status).toBe(paymentData.status);
      done();
    });
    
    serverSocket.emit('payment_status_update', paymentData);
  });

  test('should handle notifications', (done) => {
    const notification = {
      id: 'notif-123',
      type: 'payment_success',
      title: 'Payment Successful',
      message: 'Your payment has been processed',
      createdAt: new Date().toISOString()
    };
    
    clientSocket.on('new_notification', (data) => {
      expect(data.id).toBe(notification.id);
      expect(data.type).toBe(notification.type);
      expect(data.title).toBe(notification.title);
      done();
    });
    
    serverSocket.emit('new_notification', notification);
  });

  test('should handle notification count updates', (done) => {
    const count = 5;
    
    clientSocket.on('notification_count_update', (data) => {
      expect(data.count).toBe(count);
      done();
    });
    
    serverSocket.emit('notification_count_update', { count });
  });

  test('should handle connection errors gracefully', (done) => {
    const errorClient = new Client(`http://localhost:${httpServer.address().port}`, {
      auth: { token: 'invalid-token' }
    });
    
    errorClient.on('connect_error', (error) => {
      expect(error.message).toContain('Authentication error');
      errorClient.close();
      done();
    });
  });
});