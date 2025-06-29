# Evently API Documentation

## Overview

The Evently API is a comprehensive event management platform that provides real-time notifications, secure payment processing, and robust event management capabilities.

## Base URL

```
Production: https://api.evently.com
Staging: https://staging-api.evently.com
Development: http://localhost:3000
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```http
Authorization: Bearer <your_jwt_token>
```

### Obtaining a Token

1. Register a new account or login with existing credentials
2. Use the returned JWT token for subsequent requests
3. Tokens expire after 7 days and need to be refreshed

## Rate Limiting

- **General API**: 100 requests per 15 minutes per IP
- **Authentication**: 5 requests per 15 minutes per IP
- **Password Reset**: 3 requests per hour per IP

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset time

## Response Format

All API responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "pagination": {
    // Pagination info (for list endpoints)
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "requestId": "req_1234567890_abc"
}
```

## Authentication Endpoints

### Register User

**POST** `/api/auth/register`

Register a new user account with email verification.

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "Password123"
}
```

**Validation Rules:**
- `username`: 3-30 characters, alphanumeric and underscores only
- `email`: Valid email format, must be unique
- `password`: Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 number

**Response (201):**
```json
{
  "success": true,
  "message": "Registration successful! Please check your email to verify your account.",
  "data": {
    "user": {
      "id": "uuid-here",
      "username": "johndoe",
      "email": "john@example.com",
      "emailVerified": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "requiresVerification": true
  }
}
```

### Verify Email

**POST** `/api/auth/verify-email`

Verify user email address using the token sent via email.

**Request Body:**
```json
{
  "token": "verification_token_from_email"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully! You can now log in.",
  "data": {
    "user": {
      "id": "uuid-here",
      "username": "johndoe",
      "email": "john@example.com",
      "emailVerified": true
    },
    "token": "jwt_token_here"
  }
}
```

### Login User

**POST** `/api/auth/login`

Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "Password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-here",
      "username": "johndoe",
      "email": "john@example.com",
      "role": "attendee",
      "emailVerified": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "token": "jwt_token_here"
  }
}
```

### Get User Profile

**GET** `/api/auth/profile`

*Requires authentication*

Get current user's profile information.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "username": "johndoe",
    "email": "john@example.com",
    "role": "attendee",
    "emailVerified": true,
    "lastLoginAt": "2024-01-01T12:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## Events Endpoints

### Get All Events

**GET** `/api/events`

Retrieve paginated list of events with filtering and search capabilities.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `category` (optional): Filter by event category
- `search` (optional): Search in title and description
- `location` (optional): Filter by location
- `date_from` (optional): Filter events from date (ISO 8601)
- `date_to` (optional): Filter events until date (ISO 8601)
- `sort_by` (optional): Sort field (date, created_at, title, price)
- `sort_order` (optional): Sort direction (ASC, DESC)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-here",
      "title": "Tech Conference 2024",
      "description": "Annual technology conference",
      "date": "2024-06-15T09:00:00.000Z",
      "location": "Lagos, Nigeria",
      "organizerId": "organizer-uuid",
      "organizerName": "John Doe",
      "organizerEmail": "organizer@example.com",
      "isPaid": true,
      "price": 5000.00,
      "maxAttendees": 500,
      "category": "Technology",
      "isActive": true,
      "totalRsvps": 150,
      "attendingCount": 120,
      "availableSpots": 380,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalEvents": 50,
    "eventsPerPage": 10,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "filters": {
    "category": "Technology",
    "search": "conference",
    "sort_by": "date",
    "sort_order": "ASC"
  }
}
```

### Get Single Event

**GET** `/api/events/:id`

Retrieve detailed information about a specific event.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "title": "Tech Conference 2024",
    "description": "Annual technology conference for developers and tech enthusiasts",
    "date": "2024-06-15T09:00:00.000Z",
    "location": "Lagos, Nigeria",
    "organizerId": "organizer-uuid",
    "organizerName": "John Doe",
    "organizerEmail": "organizer@example.com",
    "isPaid": true,
    "price": 5000.00,
    "maxAttendees": 500,
    "category": "Technology",
    "isActive": true,
    "totalRsvps": 150,
    "attendingCount": 120,
    "maybeCount": 20,
    "declinedCount": 10,
    "availableSpots": 380,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Create Event

**POST** `/api/events`

*Requires authentication*

Create a new event.

**Request Body:**
```json
{
  "title": "Tech Meetup",
  "description": "Monthly tech meetup for developers",
  "date": "2024-07-15T18:00:00.000Z",
  "location": "Abuja, Nigeria",
  "isPaid": true,
  "price": 2000,
  "maxCapacity": 100,
  "category": "Technology"
}
```

**Validation Rules:**
- `title`: 3-255 characters
- `description`: Required, max 2000 characters
- `date`: Must be in the future (ISO 8601 format)
- `location`: 3-500 characters
- `isPaid`: Boolean
- `price`: Required if isPaid is true, must be > 0
- `maxCapacity`: 1-10000 attendees
- `category`: 2-100 characters

**Response (201):**
```json
{
  "success": true,
  "data": {
    "eventId": "uuid-here",
    "title": "Tech Meetup",
    "description": "Monthly tech meetup for developers",
    "date": "2024-07-15T18:00:00.000Z",
    "location": "Abuja, Nigeria",
    "organizerId": "user-uuid",
    "isPaid": true,
    "price": 2000,
    "maxAttendees": 100,
    "category": "Technology",
    "isActive": true,
    "creationTimestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Update Event

**PUT** `/api/events/:id`

*Requires authentication and ownership*

Update an existing event.

**Request Body:** Same as create event

**Response (200):**
```json
{
  "success": true,
  "data": {
    // Updated event data
  }
}
```

### Delete Event

**DELETE** `/api/events/:id`

*Requires authentication and ownership*

Soft delete an event (sets isActive to false).

**Response (200):**
```json
{
  "success": true,
  "message": "Event deleted successfully"
}
```

### Get User's Events

**GET** `/api/events/user/my-events`

*Requires authentication*

Get events created by the current user.

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-here",
      "title": "My Event",
      "totalRsvps": 25,
      "attendingCount": 20,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 2,
    "totalEvents": 15,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

## RSVPs Endpoints

### Create or Update RSVP

**POST** `/api/rsvps`

*Requires authentication*

Create or update an RSVP for an event.

**Request Body:**
```json
{
  "eventId": "event-uuid",
  "status": "attending"
}
```

**Validation Rules:**
- `eventId`: Valid UUID
- `status`: Must be "attending", "declined", or "maybe"

**Response (200):**
```json
{
  "success": true,
  "data": {
    "rsvpId": "uuid-here",
    "userId": "user-uuid",
    "eventId": "event-uuid",
    "status": "attending",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "eventDetails": {
      "title": "Tech Conference",
      "date": "2024-06-15T09:00:00.000Z",
      "currentAttendees": 121,
      "maxAttendees": 500,
      "availableSpots": 379
    }
  }
}
```

### Get RSVPs

**GET** `/api/rsvps`

*Requires authentication*

Get RSVPs with filtering options.

**Query Parameters:**
- `eventId` (optional): Filter by event ID (requires organizer permission)
- `userId` (optional): Filter by user ID (only own RSVPs allowed)
- `status` (optional): Filter by RSVP status
- `page` (optional): Page number
- `limit` (optional): Items per page
- `includeEventDetails` (optional): Include event information
- `includeUserDetails` (optional): Include user information (organizers only)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "rsvp-uuid",
      "userId": "user-uuid",
      "eventId": "event-uuid",
      "status": "attending",
      "eventTitle": "Tech Conference",
      "eventDate": "2024-06-15T09:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalRSVPs": 25,
    "rsvpsPerPage": 10,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "summary": {
    "attending": 20,
    "declined": 3,
    "maybe": 2,
    "total": 25
  }
}
```

### Get User's RSVPs

**GET** `/api/rsvps/my-rsvps`

*Requires authentication*

Get current user's RSVPs with event details.

**Query Parameters:**
- `status` (optional): Filter by RSVP status
- `upcomingOnly` (optional): Show only upcoming events (default: true)
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "rsvp-uuid",
      "status": "attending",
      "title": "Tech Conference",
      "description": "Annual tech conference",
      "date": "2024-06-15T09:00:00.000Z",
      "location": "Lagos, Nigeria",
      "category": "Technology",
      "organizerName": "John Doe",
      "currentAttendees": 120,
      "maxAttendees": 500,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 2,
    "totalRSVPs": 12,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "filters": {
    "status": "attending",
    "upcomingOnly": true
  }
}
```

### Get Event RSVPs (Organizers)

**GET** `/api/rsvps/event/:eventId`

*Requires authentication and organizer permission*

Get all RSVPs for a specific event with attendee details.

**Query Parameters:**
- `status` (optional): Filter by RSVP status
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response (200):**
```json
{
  "success": true,
  "data": {
    "eventInfo": {
      "title": "Tech Conference",
      "maxAttendees": 500,
      "availableSpots": 380
    },
    "rsvps": [
      {
        "id": "rsvp-uuid",
        "status": "attending",
        "username": "johndoe",
        "email": "john@example.com",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "summary": {
      "attending": 120,
      "declined": 15,
      "maybe": 25,
      "total": 160
    }
  },
  "pagination": {
    "currentPage": 1,
    "totalPages": 16,
    "totalRSVPs": 160,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Delete RSVP

**DELETE** `/api/rsvps/:id`

*Requires authentication and ownership*

Delete an RSVP.

**Response (200):**
```json
{
  "success": true,
  "message": "RSVP deleted successfully"
}
```

## Payments Endpoints

### Initialize Payment

**POST** `/api/payments/initialize`

*Requires authentication*

Initialize a payment for a paid event using Paystack.

**Request Body:**
```json
{
  "eventId": "event-uuid",
  "attendeeName": "John Doe",
  "attendeeEmail": "john@example.com"
}
```

**Validation Rules:**
- `eventId`: Valid UUID
- `attendeeName`: 2-255 characters
- `attendeeEmail`: Valid email format

**Response (201):**
```json
{
  "success": true,
  "data": {
    "paymentId": "payment-uuid",
    "authorizationUrl": "https://checkout.paystack.com/...",
    "accessCode": "access_code_here",
    "reference": "evently_1234567890_abc",
    "amount": 5000,
    "currency": "NGN",
    "eventTitle": "Tech Conference 2024"
  }
}
```

### Verify Payment

**GET** `/api/payments/verify/:reference`

*Requires authentication*

Verify a payment status with Paystack and update records.

**Response (200):**
```json
{
  "success": true,
  "message": "Payment verified successfully",
  "data": {
    "reference": "evently_1234567890_abc",
    "status": "success",
    "amount": 5000,
    "verifiedAt": "2024-01-01T12:00:00.000Z",
    "gatewayResponse": "Successful"
  }
}
```

### Get Payment History

**GET** `/api/payments/history`

*Requires authentication*

Get user's payment history.

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `status` (optional): Filter by payment status

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "payment-uuid",
      "amount": 5000,
      "currency": "NGN",
      "status": "success",
      "paystackReference": "evently_1234567890_abc",
      "eventTitle": "Tech Conference 2024",
      "eventDate": "2024-06-15T09:00:00.000Z",
      "eventLocation": "Lagos, Nigeria",
      "attendeeName": "John Doe",
      "attendeeEmail": "john@example.com",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "paidAt": "2024-01-01T00:05:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalPayments": 25,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Paystack Webhook

**POST** `/api/payments/webhook`

*Public endpoint with signature validation*

Handle Paystack webhook notifications for payment status updates.

**Headers:**
- `x-paystack-signature`: Paystack webhook signature

**Response (200):**
```json
{
  "received": true
}
```

## Notifications Endpoints

### Get Notifications

**GET** `/api/notifications`

*Requires authentication*

Get user's notifications.

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page (max: 100)
- `unreadOnly` (optional): Show only unread notifications

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "notification-uuid",
      "type": "payment_success",
      "title": "Payment Successful!",
      "message": "Your payment for Tech Conference 2024 has been processed successfully.",
      "isRead": false,
      "eventTitle": "Tech Conference 2024",
      "eventDate": "2024-06-15T09:00:00.000Z",
      "metadata": {
        "amount": 5000,
        "reference": "evently_1234567890_abc"
      },
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalNotifications": 48,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "unreadCount": 12
}
```

### Mark Notification as Read

**PUT** `/api/notifications/:id/read`

*Requires authentication*

Mark a specific notification as read.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "notification-uuid",
    "isRead": true,
    "updatedAt": "2024-01-01T12:00:00.000Z"
  }
}
```

### Mark All Notifications as Read

**PUT** `/api/notifications/read-all`

*Requires authentication*

Mark all user's notifications as read.

**Response (200):**
```json
{
  "success": true,
  "message": "12 notifications marked as read"
}
```

### Delete Notification

**DELETE** `/api/notifications/:id`

*Requires authentication*

Delete a notification.

**Response (200):**
```json
{
  "success": true,
  "message": "Notification deleted successfully"
}
```

### Get Notification Statistics

**GET** `/api/notifications/stats`

*Requires authentication*

Get notification statistics for the user.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total": 48,
    "unread": 12,
    "paymentSuccess": 8,
    "paymentFailed": 2,
    "eventReminders": 15,
    "rsvpUpdates": 23
  }
}
```

## WebSocket Events

The API supports real-time notifications via WebSocket connections.

### Connection

Connect to WebSocket with JWT authentication:

```javascript
const socket = io('wss://api.evently.com', {
  auth: {
    token: 'your_jwt_token'
  }
});
```

### Events

#### Client to Server

- `join_event`: Join event-specific room
- `leave_event`: Leave event-specific room
- `check_payment_status`: Check payment status
- `mark_notification_read`: Mark notification as read

#### Server to Client

- `new_notification`: New notification received
- `notification_count_update`: Unread notification count update
- `payment_status_update`: Payment status change
- `notification_read_confirmed`: Notification marked as read

### Example Usage

```javascript
// Join event room for real-time updates
socket.emit('join_event', 'event-uuid');

// Listen for new notifications
socket.on('new_notification', (notification) => {
  console.log('New notification:', notification);
  updateNotificationUI(notification);
});

// Listen for payment updates
socket.on('payment_status_update', (update) => {
  console.log('Payment update:', update);
  if (update.status === 'success') {
    showSuccessMessage();
  }
});

// Check payment status
socket.emit('check_payment_status', 'payment_reference');
```

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Validation errors, invalid data |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation failed |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server-side error |
| 503 | Service Unavailable - Temporary service issue |

## Common Error Responses

### Validation Error (400)
```json
{
  "success": false,
  "errors": [
    {
      "field": "email",
      "message": "Please provide a valid email address"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 characters long"
    }
  ]
}
```

### Authentication Error (401)
```json
{
  "success": false,
  "error": "Not authorized, token failed"
}
```

### Rate Limit Error (429)
```json
{
  "success": false,
  "error": "Too many requests from this IP, please try again later."
}
```

## SDKs and Libraries

### JavaScript/Node.js

```javascript
// Example API client
class EventlyAPI {
  constructor(baseURL, token) {
    this.baseURL = baseURL;
    this.token = token;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers
      },
      ...options
    };

    const response = await fetch(url, config);
    return response.json();
  }

  // Events
  async getEvents(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/events?${query}`);
  }

  async createEvent(eventData) {
    return this.request('/api/events', {
      method: 'POST',
      body: JSON.stringify(eventData)
    });
  }

  // RSVPs
  async createRSVP(rsvpData) {
    return this.request('/api/rsvps', {
      method: 'POST',
      body: JSON.stringify(rsvpData)
    });
  }

  // Payments
  async initializePayment(paymentData) {
    return this.request('/api/payments/initialize', {
      method: 'POST',
      body: JSON.stringify(paymentData)
    });
  }
}

// Usage
const api = new EventlyAPI('https://api.evently.com', 'your_token');
const events = await api.getEvents({ category: 'Technology' });
```

## Testing

### Postman Collection

Import the Postman collection for easy API testing:

```json
{
  "info": {
    "name": "Evently API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{jwt_token}}",
        "type": "string"
      }
    ]
  },
  "variable": [
    {
      "key": "base_url",
      "value": "https://api.evently.com"
    }
  ]
}
```

### Test Data

Use these test accounts for development:

```json
{
  "testUser": {
    "email": "test@evently.com",
    "password": "TestPassword123",
    "username": "testuser"
  },
  "testOrganizer": {
    "email": "organizer@evently.com",
    "password": "OrganizerPass123",
    "username": "testorganizer"
  }
}
```

## Support

For API support and questions:

- **Documentation**: https://docs.evently.com
- **Support Email**: support@evently.com
- **Status Page**: https://status.evently.com
- **GitHub Issues**: https://github.com/evently/api/issues

## Changelog

### Version 1.0.0 (Current)
- Initial API release
- Authentication with JWT
- Event management
- RSVP system
- Payment processing with Paystack
- Real-time notifications
- WebSocket support

For detailed changelog, visit: https://docs.evently.com/changelog