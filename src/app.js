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
import { ensureInvitationDb } from './config/ensureInvitationDb.js';
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
import { handleGiftWebhook } from './controllers/giftController.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const frontendDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '../frontend/public');

// Vercel / reverse proxies set X-Forwarded-For; required for express-rate-limit
app.set('trust proxy', 1);

// Middleware
app.use(performanceMonitor);
app.use(compressionMiddleware);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use('/api', apiLimiter);
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({
  origin: !corsOrigin || corsOrigin === '*' ? true : corsOrigin.split(',').map((v) => v.trim()),
  credentials: true
}));
app.use(requestSizeLimiter('5mb'));
// Registered before express.json so the signature can be checked against the exact bytes Paystack sent
app.post('/api/gifts/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res, next) => handleGiftWebhook(req, res).catch(next));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(frontendDirectory));

// Invitation-only site: old desk/door URLs redirect to the open invitation
app.get(['/guest', '/staff', '/admin'], (req, res) => {
  res.redirect(301, '/');
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

// SPA fallback for the invitation (hash routes still hit /)
app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(frontendDirectory, 'index.html'));
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server function
const startServer = async () => {
  try {
    await connectDB();
    await ensureInvitationDb();
    console.log('✅ Database connected successfully');

    const server = createServer(app);
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

// Local/dev: start the HTTP server. On Vercel the exported app is invoked as a serverless function.
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  startServer();
} else {
  // Warm schema/seed on cold start when running as a Vercel function
  ensureInvitationDb().catch((error) => {
    console.error('⚠️  Invitation DB bootstrap failed:', error.message);
  });
}

export default app;