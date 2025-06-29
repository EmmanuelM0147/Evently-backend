# Evently API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## Response Format

All API responses follow this format:

**Success Response:**
```json
{
  "success": true,
  "data": {...}
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message"
}
```

## Endpoints

### Authentication

#### Register User
```http
POST /api/auth/register
```

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "Password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "token": "jwt_token_here"
  }
}
```

#### Login User
```http
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "Password123"
}
```

#### Get User Profile
```http
GET /api/auth/profile
```
*Requires authentication*

#### Update User Profile
```http
PUT /api/auth/profile
```
*Requires authentication*

**Request Body:**
```json
{
  "username": "newusername",
  "email": "newemail@example.com"
}
```

### Events

#### Get All Events
```http
GET /api/events?page=1&limit=10&category=Technology&search=nodejs
```

**Query Parameters:**
- `page` (optional): Page number for pagination
- `limit` (optional): Number of events per page
- `category` (optional): Filter by event category
- `search` (optional): Search in title and description

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Tech Conference 2024",
      "description": "Annual technology conference",
      "date": "2024-06-15",
      "time": "09:00:00",
      "location": "Lagos, Nigeria",
      "price": "5000.00",
      "max_attendees": 500,
      "category": "Technology",
      "organizer_name": "John Doe"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalEvents": 50,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

#### Get Single Event
```http
GET /api/events/:id
```

#### Create Event
```http
POST /api/events
```
*Requires authentication*

**Request Body:**
```json
{
  "title": "Tech Meetup",
  "description": "Monthly tech meetup for developers",
  "date": "2024-07-15",
  "time": "18:00",
  "location": "Abuja, Nigeria",
  "price": 2000,
  "max_attendees": 100,
  "category": "Technology"
}
```

#### Update Event
```http
PUT /api/events/:id
```
*Requires authentication and ownership*

#### Delete Event
```http
DELETE /api/events/:id
```
*Requires authentication and ownership*

#### Get User's Events
```http
GET /api/events/user/my-events
```
*Requires authentication*

### Payments

#### Initialize Payment
```http
POST /api/payments/initialize
```
*Requires authentication*

**Request Body:**
```json
{
  "event_id": 1,
  "attendee_name": "Jane Doe",
  "attendee_email": "jane@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "authorization_url": "https://checkout.paystack.com/...",
    "access_code": "access_code_here",
    "reference": "evently_1234567890_1"
  }
}
```

#### Verify Payment
```http
GET /api/payments/verify/:reference
```
*Requires authentication*

**Response:**
```json
{
  "success": true,
  "message": "Payment verified successfully",
  "data": {
    "reference": "evently_1234567890_1",
    "status": "completed",
    "amount": 5000
  }
}
```

#### Get Payment History
```http
GET /api/payments/history
```
*Requires authentication*

## Error Codes

- `400` - Bad Request (validation errors, invalid data)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

## Rate Limiting

API calls are rate limited to prevent abuse. Current limits:
- 100 requests per 15 minutes per IP address
- 1000 requests per hour for authenticated users

## Pagination

List endpoints support pagination with these query parameters:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)

Pagination info is included in the response under the `pagination` key.

## Search and Filtering

### Events
- Search by title/description: `?search=keyword`
- Filter by category: `?category=Technology`
- Combine filters: `?category=Technology&search=nodejs&page=2`

## Webhook Integration

For production use, implement Paystack webhooks to handle payment notifications:

```http
POST /api/webhooks/paystack
```

This endpoint should verify the webhook signature and update payment/booking status accordingly.