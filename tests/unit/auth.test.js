import { jest } from '@jest/globals';
import request from 'supertest';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../src/config/database.js';
import { sendEmail } from '../../src/config/email.js';
import app from '../../src/app.js';

// Mock dependencies
jest.mock('../../src/config/database.js');
jest.mock('../../src/config/email.js');

describe('Authentication Controller', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect.mockResolvedValue(mockClient);
    
    // Reset JWT mock
    jwt.sign = jest.fn();
    jwt.verify = jest.fn();
    
    // Reset bcrypt mock
    bcryptjs.hash = jest.fn();
    bcryptjs.compare = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/auth/register', () => {
    const validRegistrationData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password123'
    };

    test('should register user with valid data', async () => {
      // Mock user doesn't exist
      pool.query.mockResolvedValueOnce({ rows: [] });
      
      // Mock password hashing
      bcryptjs.hash.mockResolvedValue('hashed_password_123');
      
      // Mock user creation
      const mockUser = {
        id: 'user-uuid-123',
        username: 'testuser',
        email: 'test@example.com',
        created_at: new Date().toISOString(),
        email_verified: false
      };
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      // Mock email sending
      sendEmail.mockResolvedValue({ success: true, messageId: 'msg-123' });

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Registration successful');
      expect(response.body.data.user.email).toBe(validRegistrationData.email);
      expect(response.body.data.requiresVerification).toBe(true);
      expect(bcryptjs.hash).toHaveBeenCalledWith('Password123', 12);
    });

    test('should reject registration with existing email', async () => {
      // Mock user exists
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] });

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('User already exists');
    });

    test('should reject weak password', async () => {
      const weakPasswordData = {
        ...validRegistrationData,
        password: 'weak'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(weakPasswordData);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.some(err => err.path === 'password')).toBe(true);
    });

    test('should reject invalid email format', async () => {
      const invalidEmailData = {
        ...validRegistrationData,
        email: 'invalid-email'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidEmailData);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.some(err => err.path === 'email')).toBe(true);
    });

    test('should reject invalid username', async () => {
      const invalidUsernameData = {
        ...validRegistrationData,
        username: 'ab' // Too short
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidUsernameData);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should handle database errors gracefully', async () => {
      pool.query.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error');
    });

    test('should handle email sending errors gracefully', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] }); // User doesn't exist
      bcryptjs.hash.mockResolvedValue('hashed_password');
      pool.query.mockResolvedValueOnce({ rows: [generateMockUser()] }); // User created
      sendEmail.mockRejectedValue(new Error('Email service unavailable'));

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      // Should still succeed even if email fails
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/auth/login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'Password123'
    };

    test('should login with valid credentials', async () => {
      const mockUser = {
        id: 'user-uuid-123',
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashed_password',
        role: 'attendee',
        email_verified: true,
        created_at: new Date().toISOString()
      };
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });
      bcryptjs.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock_jwt_token_123');
      pool.query.mockResolvedValueOnce({ rows: [] }); // Update last login

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(validLoginData.email);
      expect(response.body.data.token).toBe('mock_jwt_token_123');
      expect(bcryptjs.compare).toHaveBeenCalledWith('Password123', 'hashed_password');
      expect(jwt.sign).toHaveBeenCalledWith({ id: 'user-uuid-123' }, process.env.JWT_SECRET, expect.any(Object));
    });

    test('should reject invalid credentials - user not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });

    test('should reject invalid credentials - wrong password', async () => {
      const mockUser = {
        id: 'user-uuid-123',
        email: 'test@example.com',
        password_hash: 'hashed_password',
        email_verified: true
      };
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });
      bcryptjs.compare.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });

    test('should reject unverified email', async () => {
      const mockUser = {
        id: 'user-uuid-123',
        email: 'test@example.com',
        password_hash: 'hashed_password',
        email_verified: false
      };
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });
      bcryptjs.compare.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('verify your email');
      expect(response.body.requiresVerification).toBe(true);
    });

    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /api/auth/verify-email', () => {
    test('should verify valid token', async () => {
      const mockUser = {
        id: 'user-uuid-123',
        username: 'testuser',
        email: 'test@example.com',
        email_verified: false,
        token_expires_at: new Date(Date.now() + 3600000).toISOString()
      };
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });
      pool.query.mockResolvedValueOnce({ rows: [] }); // Update query
      jwt.sign.mockReturnValue('new_jwt_token');

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: 'valid-token-123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Email verified successfully');
      expect(response.body.data.token).toBe('new_jwt_token');
    });

    test('should reject invalid token', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: 'invalid-token' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid or expired');
    });

    test('should reject already verified email', async () => {
      const mockUser = {
        id: 'user-uuid-123',
        email_verified: true
      };
      
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: 'valid-token-123' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('already verified');
    });

    test('should require token', async () => {
      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('required');
    });
  });

  describe('GET /api/auth/profile', () => {
    test('should return user profile with valid token', async () => {
      const mockUser = {
        id: 'user-uuid-123',
        username: 'testuser',
        email: 'test@example.com',
        role: 'attendee',
        email_verified: true,
        created_at: new Date().toISOString()
      };
      
      // Mock authentication middleware
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Auth middleware
      pool.query.mockResolvedValueOnce({ rows: [mockUser] }); // Profile query

      const token = jwt.sign({ id: 'user-uuid-123' }, process.env.JWT_SECRET);
      jwt.verify.mockReturnValue({ id: 'user-uuid-123' });

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('user-uuid-123');
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/profile');

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('no token');
    });

    test('should reject invalid token', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('token failed');
    });
  });

  describe('Authentication Middleware', () => {
    test('should authenticate valid JWT token', async () => {
      const mockUser = generateMockUser();
      const token = jwt.sign({ id: mockUser.id }, process.env.JWT_SECRET);
      
      jwt.verify.mockReturnValue({ id: mockUser.id });
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(response.status).toBe(200);
    });

    test('should reject expired token', async () => {
      jwt.verify.mockImplementation(() => {
        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer expired-token');

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('token failed');
    });

    test('should reject malformed token', async () => {
      jwt.verify.mockImplementation(() => {
        const error = new Error('Invalid token');
        error.name = 'JsonWebTokenError';
        throw error;
      });

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer malformed-token');

      expect(response.status).toBe(401);
    });

    test('should handle user not found after token verification', async () => {
      jwt.verify.mockReturnValue({ id: 'non-existent-user' });
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('user not found');
    });
  });
});