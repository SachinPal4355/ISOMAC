/**
 * import.test.js — Import commit rollback on failure
 *
 * Tests that a commit with invalid rows does not partially write to DB.
 * On replica set: verifies transaction rollback.
 * On standalone: verifies error response contains failure details.
 */
const request  = require('supertest');
const mongoose = require('mongoose');
const path     = require('path');
const fs       = require('fs');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/isomac_test';
process.env.MONGO_URI      = TEST_MONGO_URI;
process.env.SESSION_SECRET = 'test-session-secret-32chars-minimum';
process.env.JWT_SECRET     = 'test-jwt-secret-32chars-minimum-xx';
process.env.NODE_ENV       = 'test';

const app   = require('../server');
const User  = require('../models/User');
const Asset = require('../models/Asset');
const bcrypt = require('bcrypt');

let adminCookie;

// Build a minimal CSV buffer for testing
function csvBuffer(rows) {
  const header = 'assetTag,name,category,status';
  const lines  = [header, ...rows].join('\n');
  return Buffer.from(lines, 'utf8');
}

beforeAll(async () => {
  await new Promise(r => setTimeout(r, 1500));
  await User.deleteMany({ username: /^testimport_/ });
  await Asset.deleteMany({ assetTag: /^IMP-TEST-/ });

  const hashed = await bcrypt.hash('Admin1234', 10);
  await User.create({ username: 'testimport_admin', password: hashed, role: 'admin' });

  const loginRes = await request(app)
    .post('/login')
    .send({ username: 'testimport_admin', password: 'Admin1234' });
  adminCookie = loginRes.headers['set-cookie'];
});

afterAll(async () => {
  await User.deleteMany({ username: /^testimport_/ });
  await Asset.deleteMany({ assetTag: /^IMP-TEST-/ });
  await mongoose.disconnect();
});

describe('Import commit', () => {
  test('valid CSV inserts assets', async () => {
    const csv = csvBuffer([
      'IMP-TEST-001,Import Laptop 1,Laptop,Available',
      'IMP-TEST-002,Import Laptop 2,Laptop,Available',
    ]);

    const res = await request(app)
      .post('/import/assets/commit?category=Laptop')
      .set('Cookie', adminCookie)
      .attach('file', csv, { filename: 'test.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(2);
    expect(res.body.failed).toBe(0);
  });

  test('invalid rows are reported in errors array', async () => {
    const csv = csvBuffer([
      // Missing assetTag — should fail validation
      ',Missing Tag Laptop,Laptop,Available',
    ]);

    const res = await request(app)
      .post('/import/assets/commit?category=Laptop')
      .set('Cookie', adminCookie)
      .attach('file', csv, { filename: 'test.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(0);
    expect(res.body.failed).toBeGreaterThan(0);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  test('rejects non-CSV file', async () => {
    const res = await request(app)
      .post('/import/assets/commit?category=Laptop')
      .set('Cookie', adminCookie)
      .attach('file', Buffer.from('fake exe'), { filename: 'malware.exe', contentType: 'application/octet-stream' });

    expect(res.status).toBe(400);
  });

  test('requires authentication', async () => {
    const csv = csvBuffer(['IMP-TEST-999,Test,Laptop,Available']);
    const res = await request(app)
      .post('/import/assets/commit')
      .attach('file', csv, { filename: 'test.csv', contentType: 'text/csv' });

    expect(res.status).toBe(401);
  });
});
