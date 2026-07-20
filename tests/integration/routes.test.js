const request = require('supertest');
const app = require('../../index'); // We require the express app

// Note: Since we are not connecting to the real DB during integration tests in this limited environment,
// some routes that require DB queries might fail or timeout if we don't mock them. 
// For routes that only render static views or do not hit the DB initially (like GET /auth/login), 
// we can test if they return 200 OK.

describe('Integration Tests: Public Routes', () => {
  beforeAll(() => {
    const mongoose = require('mongoose');
    mongoose.set('bufferCommands', false);
  });

  it('GET / should return 200 OK and render landing page', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('E-Learning');
  });

  it('GET /auth/login should return 200 OK', async () => {
    const res = await request(app).get('/auth/login');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Sign in');
  });

  it('GET /auth/register should return 200 OK', async () => {
    // Note: GET /auth/register queries SystemSetting for 'allowRegistration'
    // Since we don't have a DB connection in this test, it will hit the .catch() block 
    // and fallback to rendering the register page normally, which is fine.
    const res = await request(app).get('/auth/register');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Create an account');
  });

  it('GET /non-existent-route should return 404', async () => {
    const res = await request(app).get('/this-route-does-not-exist-12345');
    expect(res.statusCode).toBe(404);
  });
});
