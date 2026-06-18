/**
 * asset.test.js — Asset CRUD + soft-delete
 */
const request  = require('supertest');
const mongoose = require('mongoose');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/isomac_test';
process.env.MONGO_URI      = TEST_MONGO_URI;
process.env.SESSION_SECRET = 'test-session-secret-32chars-minimum';
process.env.JWT_SECRET     = 'test-jwt-secret-32chars-minimum-xx';
process.env.NODE_ENV       = 'test';

const app    = require('../server');
const User   = require('../models/User');
const Asset  = require('../models/Asset');
const bcrypt = require('bcrypt');

let adminCookie;
let createdAssetId;

beforeAll(async () => {
  await new Promise(r => setTimeout(r, 1500));
  await User.deleteMany({ username: /^testadmin_/ });
  await Asset.deleteMany({ assetTag: /^TEST-/ });

  const hashed = await bcrypt.hash('Admin1234', 10);
  await User.create({ username: 'testadmin_asset', password: hashed, role: 'admin' });

  // Login to get session cookie
  const loginRes = await request(app)
    .post('/login')
    .send({ username: 'testadmin_asset', password: 'Admin1234' });

  adminCookie = loginRes.headers['set-cookie'];
});

afterAll(async () => {
  await User.deleteMany({ username: /^testadmin_/ });
  await Asset.deleteMany({ assetTag: /^TEST-/ });
  await mongoose.disconnect();
});

describe('Asset CRUD', () => {
  test('POST /assets — creates asset', async () => {
    const res = await request(app)
      .post('/assets')
      .set('Cookie', adminCookie)
      .send({
        assetTag: 'TEST-001',
        name:     'Test Laptop',
        category: 'Laptop',
        status:   'Available',
      });

    expect(res.status).toBe(201);
    expect(res.body.asset.assetTag).toBe('TEST-001');
    createdAssetId = res.body.asset._id;
  });

  test('GET /assets — returns created asset', async () => {
    const res = await request(app)
      .get('/assets')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    const assets = res.body.data || res.body;
    const found = (Array.isArray(assets) ? assets : []).find(a => a.assetTag === 'TEST-001');
    expect(found).toBeDefined();
  });

  test('PUT /assets/:id — updates asset', async () => {
    const res = await request(app)
      .put(`/assets/${createdAssetId}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Updated Laptop', category: 'Laptop' });

    expect(res.status).toBe(200);
    expect(res.body.asset.name).toBe('Updated Laptop');
  });

  test('DELETE /assets/:id — soft-deletes (not hard)', async () => {
    const res = await request(app)
      .delete(`/assets/${createdAssetId}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);

    // Verify document still exists in DB with isDeleted=true
    const doc = await Asset.findById(createdAssetId);
    expect(doc).not.toBeNull();
    expect(doc.isDeleted).toBe(true);
    expect(doc.deletedAt).toBeDefined();
  });

  test('GET /assets — soft-deleted asset not returned', async () => {
    const res = await request(app)
      .get('/assets')
      .set('Cookie', adminCookie);

    const assets = res.body.data || res.body;
    const found = (Array.isArray(assets) ? assets : []).find(a => a._id === createdAssetId);
    expect(found).toBeUndefined();
  });

  test('POST /assets — rejects duplicate assetTag', async () => {
    // Re-create with same tag (soft-deleted one should not block)
    // First restore it to test duplicate on active asset
    await Asset.findByIdAndUpdate(createdAssetId, { isDeleted: false, deletedAt: null });

    const res = await request(app)
      .post('/assets')
      .set('Cookie', adminCookie)
      .send({ assetTag: 'TEST-001', name: 'Duplicate', category: 'Laptop' });

    expect(res.status).toBe(409);
  });

  test('POST /assets — rejects missing required fields', async () => {
    const res = await request(app)
      .post('/assets')
      .set('Cookie', adminCookie)
      .send({ name: 'No Tag' });

    expect(res.status).toBe(400);
  });

  test('GET /assets — requires authentication', async () => {
    const res = await request(app).get('/assets');
    expect(res.status).toBe(401);
  });
});
