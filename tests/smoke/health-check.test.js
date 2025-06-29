import request from 'supertest';
import app from '../../src/app.js';

describe('Smoke Tests - Production Readiness', () => {
  describe('Health Checks', () => {
    test('should respond to health check endpoint', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('OK');
      expect(response.body.version).toBeDefined();
      expect(response.body.uptime).toBeGreaterThan(0);
      expect(response.body.memory).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });

    test('health endpoint should respond quickly', async () => {
      const startTime = Date.now();
      const response = await request(app).get('/health');
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(100); // Should respond in under 100ms
    });
  });

  describe('API Endpoints Availability', () => {
    test('auth endpoints should be available', async () => {
      // Test registration endpoint (expect validation error with empty body)
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({});
      
      expect([400, 422]).toContain(registerResponse.status); // Validation error is expected
      
      // Test login endpoint (expect validation error with empty body)
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({});
      
      expect([400, 422]).toContain(loginResponse.status); // Validation error is expected
    });

    test('events endpoints should be available', async () => {
      // Test public events endpoint
      const eventsResponse = await request(app).get('/api/events');
      
      expect(eventsResponse.status).toBe(200);
      expect(eventsResponse.body).toBeDefined();
    });

    test('protected endpoints should require authentication', async () => {
      // Test protected endpoint without auth
      const profileResponse = await request(app).get('/api/auth/profile');
      
      expect(profileResponse.status).toBe(401);
      expect(profileResponse.body.message).toContain('Not authorized');
    });
  });

  describe('Security Headers', () => {
    test('should include security headers', async () => {
      const response = await request(app).get('/health');
      
      // Check for helmet security headers
      expect(response.headers['x-content-type-options']).toBeDefined();
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    test('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/api/events')
        .set('Origin', 'http://localhost:3000');
      
      expect([200, 204]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to auth endpoints', async () => {
      // Make multiple requests to trigger rate limiting
      const requests = Array(10).fill().map(() =>
        request(app)
          .post('/api/auth/login')
          .send({ email: 'test@test.com', password: 'password' })
      );
      
      const responses = await Promise.all(requests);
      
      // At least one should be rate limited
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 routes gracefully', async () => {
      const response = await request(app).get('/non-existent-route');
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');
      
      expect([400, 422]).toContain(response.status);
    });
  });

  describe('Performance Benchmarks', () => {
    test('API responses should be fast enough', async () => {
      const endpoints = [
        '/health',
        '/api/events',
        '/api/events?page=1&limit=10'
      ];
      
      for (const endpoint of endpoints) {
        const startTime = Date.now();
        const response = await request(app).get(endpoint);
        const responseTime = Date.now() - startTime;
        
        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(1000); // Under 1 second
      }
    });

    test('should handle concurrent requests', async () => {
      const concurrentRequests = 20;
      const promises = Array(concurrentRequests).fill().map(() =>
        request(app).get('/api/events')
      );
      
      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      // Should handle concurrent load efficiently
      expect(totalTime).toBeLessThan(5000); // Under 5 seconds for 20 concurrent requests
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should not have memory leaks in endpoints', async () => {
      const initialMemory = process.memoryUsage();
      
      // Make multiple requests to test for memory leaks
      for (let i = 0; i < 50; i++) {
        await request(app).get('/api/events');
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Configuration Validation', () => {
    test('should have required environment variables', async () => {
      const requiredEnvVars = [
        'NODE_ENV',
        'JWT_SECRET',
        'DB_HOST',
        'DB_NAME'
      ];
      
      requiredEnvVars.forEach(envVar => {
        expect(process.env[envVar]).toBeDefined();
      });
    });

    test('should be in correct environment', async () => {
      expect(['development', 'test', 'production']).toContain(process.env.NODE_ENV);
    });
  });
});