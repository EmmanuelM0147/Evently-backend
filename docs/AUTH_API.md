# Authentication API Documentation

## Overview

The Evently authentication system provides secure user registration, login, and email verification with comprehensive security measures.

## Security Features

- **Password Requirements**: Minimum 8 characters with uppercase, lowercase, and number
- **Rate Limiting**: 5 authentication attempts per 15 minutes per IP
- **Email Verification**: Required before account activation
- **JWT Tokens**: Secure token-based authentication
- **Password Hashing**: bcrypt with 12 salt rounds
- **Input Validation**: Comprehensive server-side validation

## Base URL
```
http://localhost:3000/api/auth
```

## Endpoints

### 1. User Registration

**Endpoint:** `POST /api/auth/register`

**Rate Limit:** 5 requests per 15 minutes per IP

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "Password123"
}
```

**Validation Rules:**
- **username**: 3-30 characters, alphanumeric and underscores only
- **email**: Valid email format, must be unique
- **password**: Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 number

**Success Response (201):**
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

**Error Responses:**
- `400`: Validation errors or user already exists
- `429`: Rate limit exceeded
- `500`: Server error

### 2. Email Verification

**Endpoint:** `POST /api/auth/verify-email`

**Request Body:**
```json
{
  "token": "verification_token_from_email"
}
```

**Success Response (200):**
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

**Error Responses:**
- `400`: Invalid or expired token, already verified
- `500`: Server error

### 3. User Login

**Endpoint:** `POST /api/auth/login`

**Rate Limit:** 5 requests per 15 minutes per IP

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "Password123"
}
```

**Success Response (200):**
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

**Error Responses:**
- `401`: Invalid credentials or email not verified
- `429`: Rate limit exceeded
- `500`: Server error

### 4. Resend Verification Email

**Endpoint:** `POST /api/auth/resend-verification`

**Rate Limit:** 5 requests per 15 minutes per IP

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Verification email sent successfully!"
}
```

### 5. Get User Profile

**Endpoint:** `GET /api/auth/profile`

**Authentication:** Required (Bearer token)

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Success Response (200):**
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

### 6. Update User Profile

**Endpoint:** `PUT /api/auth/profile`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "username": "newusername",
  "email": "newemail@example.com"
}
```

## Authentication Flow

### Registration Flow
1. User submits registration form
2. Server validates input and checks for existing users
3. Password is hashed and user is created (unverified)
4. Verification email is sent with unique token
5. User receives email and clicks verification link
6. Token is verified and user account is activated
7. User can now log in

### Login Flow
1. User submits login credentials
2. Server validates email and password
3. Server checks if email is verified
4. JWT token is generated and returned
5. Token is used for subsequent authenticated requests

## Security Considerations

### Rate Limiting
- Authentication endpoints: 5 requests per 15 minutes
- General API: 100 requests per 15 minutes
- Password reset: 3 requests per hour

### Password Security
- Minimum 8 characters
- Must contain uppercase letter
- Must contain lowercase letter
- Must contain at least one number
- Hashed with bcrypt (12 rounds)

### Token Security
- JWT tokens expire in 7 days
- Verification tokens expire in 24 hours
- Tokens are cryptographically secure random strings

### Email Security
- HTML email templates with security warnings
- Token expiration notifications
- No sensitive information in emails

## Error Codes Reference

| Code | Description |
|------|-------------|
| 400 | Bad Request - Validation errors, invalid data |
| 401 | Unauthorized - Invalid credentials, unverified email |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server-side error |

## Example Integration (React)

```javascript
// Registration
const register = async (userData) => {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });
  return response.json();
};

// Login
const login = async (credentials) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });
  const data = await response.json();
  
  if (data.success) {
    localStorage.setItem('token', data.data.token);
  }
  
  return data;
};

// Authenticated requests
const getProfile = async () => {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/auth/profile', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};
```

## Environment Variables Required

```env
# JWT Configuration
JWT_SECRET=your_very_secure_secret_key_here
JWT_EXPIRES_IN=7d

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

## Testing Checklist

- [ ] Registration with valid data
- [ ] Registration with invalid/duplicate data
- [ ] Email verification with valid token
- [ ] Email verification with invalid/expired token
- [ ] Login with verified account
- [ ] Login with unverified account
- [ ] Login with invalid credentials
- [ ] Rate limiting functionality
- [ ] JWT token validation
- [ ] Password strength validation
- [ ] Email format validation
- [ ] Profile retrieval and updates