/**
 * rbac.test.js — Role-based access control
 *
 * Verifies that admin/editor/viewer roles get correct access
 * across create, update, delete, and admin-only endpoints.
 */
const request  = require('supertest');
const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');

process.env.MONGO_URI      = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/isomac_test';
process.env.SESSION_SECRET = 'test-session-secret-32chars-minimum';
process.env.JWT_SECRET     = 'test-jwt-secret-32chars-minimum-xx';
process.env.NODE_ENV       = 'test';

const app   = require('../server');
const User  = require('../models/User');
const Asset = require('../models/Asset');

const USERS = {
  admin:  { username: 'rbac_admin',  password: 'Admin1234',  role: 'admin'  },
  editor: { username: 'rbac_editor', password: 'Editor1234', role: 'editor' },
  viewer: { username: 'rbac_viewer', password: 'Viewer1234', role: 'viewer' },
};

const cookies = {};

async function loginAs(role) {
  const u = USERS[role];
  const res = await request(app).post('/login').send({ username: u.username, password: u.password });
  return res.headers['set-cookie'];
}

beforeAll(async () => {
  await new Promise(r => setTimeout(r, 1500));
  await User.deleteMany({ username: /^rbac_/ });
  await Asset.deleteMany({ assetTag: /^RBAC-/ });

  for (const [, u] of Object.entries(USERS)) {
    const hashed = await bcrypt.hash(u.password, 10);
    await User.create({ username: u.username, password: hashed, role: u.role });
  }

  cookies.admin  = await loginAs('admin');
  cookies.editor = await loginAs('editor');
  cookies.viewer = await loginAs('viewer');

  // Create a test asset for update/delete tests
  await request(app).post('/assets').set('Cookie', cookies.admin)
    .send({ assetTag: 'RBAC-001', name: 'RBAC Test', category: 'Laptop', status: 'Available' });
});

afterAll(async () => {
  await User.deleteMany({ username: /^rbac_/ });
  await Asset.deleteMany({ assetTag: /^RBAC-/ });
  await mongoose.disconnect();
});

// ── GET /assets — all roles can read ─────────────────────────────────────────
describe('GET /assets — read access', () => {
  test('admin can read',  async () => { expect((await request(app).get('/assets').set('Cookie', cookies.admin)).status).toBe(200); });
  test('editor can read', async () => { expect((await request(app).get('/assets').set('Cookie', cookies.editor)).status).toBe(200); });
  test('viewer can read', async () => { expect((await request(app).get('/assets').set('Cookie', cookies.viewer)).status).toBe(200); });
  test('unauthenticated → 401', async () => { expect((await request(app).get('/assets')).status).toBe(401); });
});

// ── POST /assets — editor+ only ───────────────────────────────────────────────
describe('POST /assets — create access', () => {
  test('admin can create', async () => {
    const res = await request(app).post('/assets').set('Cookie', cookies.admin)
      .send({ assetTag: 'RBAC-ADM', name: 'Admin Asset', category: 'Laptop' });
    expect(res.status).toBe(201);
  });

  test('editor can create', async () => {
    const res = await request(app).post('/assets').set('Cookie', cookies.editor)
      .send({ assetTag: 'RBAC-EDT', name: 'Editor Asset', category: 'Laptop' });
    expect(res.status).toBe(201);
  });

  test('viewer cannot create → 403', async () => {
    const res = await request(app).post('/assets').set('Cookie', cookies.viewer)
      .send({ assetTag: 'RBAC-VWR', name: 'Viewer Asset', category: 'Laptop' });
    expect(res.status).toBe(403);
  });
});

// ── DELETE /assets — admin only ───────────────────────────────────────────────
describe('DELETE /assets/:id — admin only', () => {
  let assetId;

  beforeAll(async () => {
    const res = await request(app).post('/assets').set('Cookie', cookies.admin)
      .send({ assetTag: 'RBAC-DEL', name: 'Delete Test', category: 'Laptop' });
    assetId = res.body.asset?._id;
  });

  test('viewer cannot delete → 403', async () => {
    const res = await request(app).delete(`/assets/${assetId}`).set('Cookie', cookies.viewer);
    expect(res.status).toBe(403);
  });

  test('editor cannot delete → 403', async () => {
    const res = await request(app).delete(`/assets/${assetId}`).set('Cookie', cookies.editor);
    expect(res.status).toBe(403);
  });

  test('admin can delete → 200', async () => {
    const res = await request(app).delete(`/assets/${assetId}`).set('Cookie', cookies.admin);
    expect(res.status).toBe(200);
  });
});

// ── GET /users — admin + editor only ─────────────────────────────────────────
describe('GET /users — admin + editor only', () => {
  test('admin can list users',  async () => { expect((await request(app).get('/users').set('Cookie', cookies.admin)).status).toBe(200); });
  test('editor can list users', async () => { expect((await request(app).get('/users').set('Cookie', cookies.editor)).status).toBe(200); });
  test('viewer cannot list users → 403', async () => { expect((await request(app).get('/users').set('Cookie', cookies.viewer)).status).toBe(403); });
});

// ── PUT /users/:id/role — admin only ─────────────────────────────────────────
describe('PUT /users/:id/role — admin only', () => {
  let viewerUserId;

  beforeAll(async () => {
    const users = await request(app).get('/users').set('Cookie', cookies.admin);
    const viewer = users.body.find(u => u.username === 'rbac_viewer');
    viewerUserId = viewer?._id;
  });

  test('editor cannot change roles → 403', async () => {
    const res = await request(app).put(`/users/${viewerUserId}/role`)
      .set('Cookie', cookies.editor).send({ role: 'editor' });
    expect(res.status).toBe(403);
  });

  test('admin can change roles → 200', async () => {
    const res = await request(app).put(`/users/${viewerUserId}/role`)
      .set('Cookie', cookies.admin).send({ role: 'viewer' }); // keep as viewer
    expect(res.status).toBe(200);
  });
});

// ── JWT auth path — same RBAC applies ────────────────────────────────────────
describe('JWT auth path — RBAC enforcement', () => {
  let viewerToken;

  beforeAll(async () => {
    const res = await request(app).post('/login')
      .send({ username: USERS.viewer.username, password: USERS.viewer.password });
    viewerToken = res.body.token;
  });

  test('viewer JWT cannot create asset → 403', async () => {
    const res = await request(app).post('/assets')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ assetTag: 'RBAC-JWT', name: 'JWT Test', category: 'Laptop' });
    expect(res.status).toBe(403);
  });

  test('viewer JWT can read assets → 200', async () => {
    const res = await request(app).get('/assets')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
  });

  test('invalid JWT → 401', async () => {
    const res = await request(app).get('/assets')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});
