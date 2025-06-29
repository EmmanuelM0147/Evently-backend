# Evently - Event Management Platform Backend API

A robust Node.js/Express backend API for event management with Supabase database and Paystack payment integration.

## Features

- 🔐 **Authentication & Authorization** - JWT-based auth with bcrypt password hashing
- 📅 **Event Management** - CRUD operations for events with pagination and search
- 🎫 **RSVP System** - Complete RSVP workflow with capacity management
- 💳 **Payment Processing** - Paystack integration for secure payments
- 🔔 **Real-time Notifications** - WebSocket-based real-time updates
- 🗄️ **Supabase Database** - Scalable database with proper indexing and RLS
- 🛡️ **Security** - Helmet, CORS, input validation, and rate limiting
- 📊 **Performance** - Caching, compression, and optimized queries

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: Supabase (PostgreSQL)
- **Payment Gateway**: Paystack
- **Authentication**: JWT, bcrypt
- **Real-time**: Socket.IO
- **Validation**: express-validator
- **Security**: Helmet, CORS, Rate Limiting

## Project Structure

```
src/
├── config/           # Database, email, and payment configurations
├── controllers/      # Request handlers
├── middleware/       # Custom middleware (auth, error handling, caching)
├── routes/          # API route definitions
└── utils/           # Utility functions (validation, helpers)

tests/
├── unit/            # Unit tests
├── integration/     # Integration tests
├── load/           # Load testing with k6
└── smoke/          # Production readiness tests

docs/               # API documentation
aws/               # AWS deployment configurations
supabase/          # Database migrations
```

## Quick Start

1. **Clone and Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database Setup**
   - Click "Connect to Supabase" in the top right to set up your database
   - Run the migrations (they will be applied automatically)
   - Update database credentials in `.env`

4. **Paystack Setup**
   - Get your API keys from [Paystack Dashboard](https://dashboard.paystack.com)
   - Add them to your `.env` file

5. **Start Development Server**
   ```bash
   npm run dev
   ```

6. **API Access**
   - API Base URL: `http://localhost:3000/api`
   - Health Check: `http://localhost:3000/health`
   - WebSocket: `ws://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-email` - Verify email address
- `GET /api/auth/profile` - Get user profile (protected)
- `PUT /api/auth/profile` - Update user profile (protected)

### Events
- `GET /api/events` - Get all events (with pagination & search)
- `GET /api/events/:id` - Get specific event
- `POST /api/events` - Create event (protected)
- `PUT /api/events/:id` - Update event (protected)
- `DELETE /api/events/:id` - Delete event (protected)
- `GET /api/events/user/my-events` - Get user's events (protected)

### RSVPs
- `POST /api/rsvps` - Create or update RSVP (protected)
- `GET /api/rsvps` - Get RSVPs with filtering (protected)
- `GET /api/rsvps/my-rsvps` - Get user's RSVPs (protected)
- `GET /api/rsvps/event/:eventId` - Get event RSVPs (organizers only)
- `DELETE /api/rsvps/:id` - Delete RSVP (protected)

### Payments
- `POST /api/payments/initialize` - Initialize payment (protected)
- `GET /api/payments/verify/:reference` - Verify payment (protected)
- `GET /api/payments/history` - Get payment history (protected)
- `POST /api/payments/webhook` - Paystack webhook (public)

### Notifications
- `GET /api/notifications` - Get notifications (protected)
- `PUT /api/notifications/:id/read` - Mark notification as read (protected)
- `PUT /api/notifications/read-all` - Mark all as read (protected)
- `DELETE /api/notifications/:id` - Delete notification (protected)
- `GET /api/notifications/stats` - Get notification statistics (protected)

## Environment Variables

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Supabase Configuration (auto-populated when connected)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Paystack Configuration
PAYSTACK_SECRET_KEY=your_paystack_secret_key
PAYSTACK_PUBLIC_KEY=your_paystack_public_key

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Frontend URL for email links
FRONTEND_URL=http://localhost:3000
```

## Database Schema

The application uses Supabase with four main tables:
- `users` - User accounts and authentication
- `events` - Event details and management
- `rsvps` - Event attendance management
- `payments` - Payment processing records
- `notifications` - Real-time notification system

All tables have Row Level Security (RLS) enabled with appropriate policies.

## Real-time Features

The API includes WebSocket support for real-time updates:

- **Payment Status Updates** - Real-time payment confirmation
- **Notifications** - Instant notification delivery
- **Event Updates** - Live event changes
- **RSVP Updates** - Real-time attendance updates

### WebSocket Connection
```javascript
const socket = io('ws://localhost:3000', {
  auth: { token: 'your_jwt_token' }
});

// Listen for notifications
socket.on('new_notification', (notification) => {
  console.log('New notification:', notification);
});

// Listen for payment updates
socket.on('payment_status_update', (update) => {
  console.log('Payment update:', update);
});
```

## Security Features

- Password hashing with bcrypt (12 rounds)
- JWT token authentication
- Input validation and sanitization
- SQL injection prevention with parameterized queries
- CORS protection
- Security headers with Helmet
- Rate limiting (100 requests/15min general, 5 requests/15min auth)
- Row Level Security (RLS) in database

## Payment Flow

1. User creates RSVP for paid event
2. Payment is initialized with Paystack
3. User completes payment on Paystack
4. Payment is verified via webhook/callback
5. RSVP is confirmed and recorded
6. Real-time notification sent to user

## Testing

Run the comprehensive test suite:

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Smoke tests (production readiness)
npm run test:smoke

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage

# Load testing (requires k6)
npm run load-test
```

## API Documentation

Generate and serve API documentation:

```bash
# Generate OpenAPI spec
npm run docs:generate

# Serve documentation
npm run docs:serve
```

## Deployment

The API includes production-ready configurations:

- **AWS CloudFormation** templates for infrastructure
- **Docker** configuration for containerization
- **CI/CD** pipeline with AWS CodeBuild
- **Monitoring** with CloudWatch
- **Scaling** with Auto Scaling Groups
- **Load Balancing** with Application Load Balancer

### Production Deployment

1. Set `NODE_ENV=production`
2. Configure all environment variables
3. Set up SSL for secure connections
4. Enable proper logging and monitoring
5. Configure reverse proxy (nginx/Apache)

### AWS Deployment

Use the provided CloudFormation templates in the `aws/` directory:

```bash
# Deploy infrastructure
aws cloudformation deploy \
  --template-file aws/cloudformation/infrastructure.yaml \
  --stack-name evently-production \
  --parameter-overrides \
    Environment=production \
    KeyPairName=your-key-pair \
    DatabaseMasterPassword=your-secure-password \
  --capabilities CAPABILITY_IAM
```

## Performance

The API is optimized for production with:

- **Response Times**: <500ms for all endpoints
- **Throughput**: 1000+ requests/minute
- **Caching**: Multi-layer caching strategy
- **Database**: Connection pooling and optimized queries
- **Compression**: Gzip compression for responses >1KB
- **Rate Limiting**: Prevents abuse while allowing normal usage

## Health Monitoring

Monitor API health with built-in endpoints:

- `/health` - Basic health status
- Database connectivity check
- Memory usage monitoring
- Uptime tracking

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## API Client Examples

### JavaScript/Node.js

```javascript
const API_BASE = 'http://localhost:3000/api';

// Authentication
const response = await fetch(`${API_BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const { token } = await response.json();

// Authenticated requests
const events = await fetch(`${API_BASE}/events`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### cURL

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Get events
curl -X GET http://localhost:3000/api/events \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Support

For API support and questions:

- **Documentation**: Available at `/docs` when running locally
- **Health Status**: Check `/health` for API status
- **Issues**: Report bugs and feature requests via GitHub issues

## License

MIT License - see LICENSE file for details.