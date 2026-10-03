import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { initializeWebSocket } from './config/websocket.js';
import { performanceMonitor, compressionMiddleware, requestSizeLimiter } from './middleware/performance.js';
import { connectDB } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { apiLimiter } from './middleware/rateLimiter.js';

// Import routes
import authRoutes from './routes/auth.js';
import eventRoutes from './routes/events.js';
import rsvpRoutes from './routes/rsvps.js';
import paymentRoutes from './routes/payments.js';
import notificationRoutes from './routes/notifications.js';
import guestRoutes from './routes/guests.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const frontendDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '../frontend/public');

// Middleware
app.use(performanceMonitor);
app.use(compressionMiddleware);
app.use(helmet());
app.use('/api', apiLimiter);
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(requestSizeLimiter('5mb'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(frontendDirectory));

app.get(['/guest', '/staff', '/admin'], (req, res) => {
  res.sendFile(path.join(frontendDirectory, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    version: '1.0.0',
    message: 'Evently API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/rsvps', rsvpRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/guests', guestRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server function
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Database connected successfully');
    
    // Create HTTP server
    const server = createServer(app);
    
    // Initialize WebSocket
    initializeWebSocket(server);
    
    server.listen(PORT, () => {
      console.log(`🚀 Evently server running on port ${PORT}`);
      console.log(`🔌 WebSocket server initialized`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Only start server if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

// Export the app for testing
export default app;