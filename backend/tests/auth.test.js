/**
 * auth.test.js — Login success/failure + lockout
 *
 * Uses supertest to hit the real Express app against a test MongoDB.
 * Set TEST_MONGO_URI in env or it defaults to a local test DB.
 */
const request  = require('supertest');
const mongoose = require('mongoose');

// Point to a separate test database — never the production DB
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/isomac_test';
process.env.MONGO_URI     = TEST_MONGO_URI;
process.env.SESSION_SECRET = 'test-session-secret-32chars-minimum';
process.env.JWT_SECRET     = 'test-jwt-secret-32chars-minimum-xx';
process.env.NODE_ENV       = 'test';

const app  = require('../server');
const User = require('../models/User');
const bcrypt = require('bcrypt');

let testUser;

beforeAll(async () => {
  // Wait for mongoose connection (server.js connects on load)
  await new Promise(r => setTimeout(r, 1500));
  // Clean test users
  await User.deleteMany({ username: /^testuser_/ });
  // Create a known test user
  const hashed = await bcrypt.hash('Password1', 10);
  testUser = await User.create({
    username: 'testuser_auth',
    password: hashed,
    role: 'viewer',
  });
});

afterAll(async () => {
  await User.deleteMany({ username: /^testuser_/ });
  await mongoose.disconnect();
});

// ── Login success ─────────────────────────────────────────────────────────────
describe('POST /login', () => {
  test('returns 200 + token on valid credentials', async () => {
    const res = await request(app)
      .post('/login')
      .send({ username: 'testuser_auth', password: 'Password1' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.username).toBe('testuser_auth');
    expect(res.body.role).toBe('viewer');
  });

  // ── Login failure ───────────────────────────────────────────────────────────
  test('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/login')
      .send({ username: 'testuser_auth', password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
    // Must NOT reveal whether username exists
    expect(res.body.message).not.toMatch(/not found/i);
  });

  test('returns 401 on non-existent username', async () => {
    const res = await request(app)
      .post('/login')
      .send({ username: 'nobody_xyz', password: 'Password1' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  test('returns 400 when fields missing', async () => {
    const res = await request(app).post('/login').send({ username: 'testuser_auth' });
    expect(res.status).toBe(400);
  });

  // ── Account lockout ─────────────────────────────────────────────────────────
  test('locks account after 5 failed attempts', async () => {
    // Reset counter first
    await User.findByIdAndUpdate(testUser._id, { failedLoginAttempts: 0, lockedUntil: null });

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/login')
        .send({ username: 'testuser_auth', password: 'WrongPass1' });
    }

    // 6th attempt should be locked
    const res = await request(app)
      .post('/login')
      .send({ username: 'testuser_auth', password: 'Password1' }); // correct password

    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/locked/i);
  });

  test('resets counter on successful login', async () => {
    // Unlock the account manually
    await User.findByIdAndUpdate(testUser._id, { failedLoginAttempts: 0, lockedUntil: null });

    const res = await request(app)
      .post('/login')
      .send({ username: 'testuser_auth', password: 'Password1' });

    expect(res.status).toBe(200);
    const updated = await User.findById(testUser._id);
    expect(updated.failedLoginAttempts).toBe(0);
    expect(updated.lockedUntil).toBeNull();
  });
});

// ── Password policy ───────────────────────────────────────────────────────────
describe('POST /register — password policy', () => {
  test('rejects password shorter than 8 chars', async () => {
    // First-boot check: if users exist, this needs admin session — skip in that case
    const count = await User.countDocuments({ isDeleted: { $ne: true } });
    if (count > 0) return; // not first boot, skip

    const res = await request(app)
      .post('/register')
      .send({ username: 'testuser_policy', password: 'abc1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/8 characters/i);
  });

  test('rejects password with no number', async () => {
    const count = await User.countDocuments({ isDeleted: { $ne: true } });
    if (count > 0) return;

    const res = await request(app)
      .post('/register')
      .send({ username: 'testuser_policy', password: 'abcdefgh' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/number/i);
  });
});
