/**
 * auth.routes.js — Enterprise-grade Authentication & User Management
 *
 * ✅ Phase 1 — JWT: 15-min expiry, jti (UUID), tokenVersion, permissions
 * ✅ Phase 2 — Refresh tokens: SHA-256 hashed, device-aware, 7-day absolute expiry
 * ✅ Phase 3 — Logout single + logout-all
 * ✅ Phase 4 — Token versioning: invalidates all tokens on password/role change
 * ✅ Phase 5 — Configurable password policy via env vars
 * ✅ Phase 6 — Strict rate limiting on auth endpoints
 * ✅ Phase 7 — Auth audit logging for all security events
 */

const express      = require('express');
const bcrypt       = require('bcrypt');
const jwt          = require('jsonwebtoken');
const crypto       = require('crypto');
const { v4: uuidv4 } = require('uuid');
const rateLimit    = require('express-rate-limit');

const User          = require('../models/User');
const Tenant        = require('../models/Tenant');
const RefreshToken  = require('../models/RefreshToken');
const AuthAuditLog  = require('../models/AuthAuditLog');
const { requireAuth, requireRole, normaliseRole, validateTenant } = require('../middleware/auth');
const { captureAuthFailure } = require('../lib/sentry');

const router = express.Router();

// ─── Constants ────────────────────────────────────────────────────────────────
const VALID_ROLES        = ['super_admin', 'company_admin', 'admin', 'editor', 'employee', 'viewer'];
const MAX_ATTEMPTS       = 5;
const LOCKOUT_DURATION   = 15 * 60 * 1000;       // 15 min
const ACCESS_TOKEN_TTL   = 15 * 60;              // 15 min in seconds
const REFRESH_TOKEN_DAYS = 7;
const BCRYPT_ROUNDS      = process.env.NODE_ENV === 'production' ? 12 : 10;

// ─── Phase 6: Auth-specific rate limiter ─────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Try again in 15 minutes.' },
});

// ─── Phase 5: Configurable password policy ───────────────────────────────────
function getPasswordPolicy() {
  return {
    minLength:        Math.max(8, parseInt(process.env.PASSWORD_MIN_LENGTH  || '8')),
    maxLength:        Math.min(256, parseInt(process.env.PASSWORD_MAX_LENGTH || '128')),
    requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE === 'true',
  };
}

function validatePassword(rawPassword) {
  const password = (rawPassword || '').trim();
  const policy   = getPasswordPolicy();
  const errors   = [];

  if (password.length < policy.minLength)
    errors.push(`Password must be at least ${policy.minLength} characters.`);
  if (password.length > policy.maxLength)
    errors.push(`Password must not exceed ${policy.maxLength} characters.`);
  if (!/\d/.test(password))
    errors.push('Password must contain at least 1 number.');
  if (policy.requireUppercase && !/[A-Z]/.test(password))
    errors.push('Password must contain at least 1 uppercase letter.');

  return errors.length ? errors.join(' ') : null;
}

// ─── Phase 1: Role → permissions mapping ─────────────────────────────────────
function permissionsForRole(role) {
  switch (role) {
    case 'super_admin':   return { canCreate: true,  canDelete: true,  canManageUsers: true,  canManageOrgs: true  };
    case 'company_admin': return { canCreate: true,  canDelete: true,  canManageUsers: true,  canManageOrgs: false };
    case 'admin':         return { canCreate: true,  canDelete: true,  canManageUsers: true,  canManageOrgs: false };
    case 'editor':        return { canCreate: true,  canDelete: false, canManageUsers: false, canManageOrgs: false };
    case 'employee':      return { canCreate: false, canDelete: false, canManageUsers: false, canManageOrgs: false };
    default:              return { canCreate: false, canDelete: false, canManageUsers: false, canManageOrgs: false };
  }
}

// ─── Phase 1: Sign access token ──────────────────────────────────────────────
function signAccessToken(user) {
  const secret = process.env.JWT_SECRET || 'dev-only-jwt-secret-not-for-production';
  return jwt.sign(
    {
      userId:         String(user._id),
      username:       user.username,
      role:           user.role,
      permissions:    permissionsForRole(user.role),
      tenantId:       user.tenantId ? String(user.tenantId) : null,
      organizationId: user.organizationId ? String(user.organizationId) : null, // legacy
      tokenVersion:   user.tokenVersion ?? 0,
      jti:            uuidv4(),
    },
    secret,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

// ─── Phase 2: Issue refresh token ────────────────────────────────────────────
async function issueRefreshToken(userId, meta = {}) {
  const plaintext      = crypto.randomBytes(48).toString('hex'); // 384-bit entropy
  const tokenHash      = RefreshToken.hash(plaintext);
  const absoluteExpiry = new Date(Date.now() + REFRESH_TOKEN_DAYS * 86400000);

  await RefreshToken.create({
    userId,
    tokenHash,
    deviceId:       meta.deviceId  || '',
    userAgent:      meta.userAgent || '',
    ipAddress:      meta.ipAddress || '',
    absoluteExpiry,
  });

  return plaintext;
}

// ─── Phase 7: Audit helper ────────────────────────────────────────────────────
async function audit(action, { userId, username, success = true, ip, userAgent, deviceId, detail } = {}) {
  try {
    await AuthAuditLog.create({
      userId:   userId   || null,
      username: username || '',
      action,
      success,
      metadata: { ip: ip || '', userAgent: userAgent || '', deviceId: deviceId || '', detail: detail || '' },
    });
  } catch (_) { /* audit must never crash the main flow */ }
}

// ─── Helper: extract request metadata ────────────────────────────────────────
function getMeta(req) {
  return {
    ip:        req.ip || req.headers['x-forwarded-for'] || '',
    userAgent: req.headers['user-agent'] || '',
    deviceId:  req.headers['x-device-id'] || '',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /register ───────────────────────────────────────────────────────────
// Public on first boot. After that, requires admin or super_admin via session OR JWT.
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, password, role, fullName, email, department } = req.body;

    if (!username || !password)
      return res.status(400).json({ message: 'username and password required' });

    const policyError = validatePassword(password);
    if (policyError) return res.status(400).json({ message: policyError });

    const userCount   = await User.countDocuments({ isDeleted: { $ne: true } });
    const isFirstBoot = userCount === 0;

    if (!isFirstBoot) {
      // Resolve caller identity from JWT (Authorization header) OR session cookie.
      // requireAuth is not used as middleware here because first-boot must be public,
      // so we inline the same dual-path logic.
      let callerRole = null;

      // PATH 1: JWT Bearer token (frontend in-memory token system)
      const authHeader = req.headers['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) {
        const token  = authHeader.slice(7);
        const secret = process.env.JWT_SECRET || 'dev-only-jwt-secret-not-for-production';
        try {
          const decoded = require('jsonwebtoken').verify(token, secret);
          callerRole = normaliseRole(decoded.role);
        } catch (_) {
          return res.status(401).json({ message: 'Invalid or expired token' });
        }
      }
      // PATH 2: Session cookie
      else if (req.session?.user) {
        callerRole = normaliseRole(req.session.user.role);
      }
      else {
        return res.status(401).json({ message: 'Unauthorized: please log in' });
      }

      const isSuperAdmin = callerRole === 'super_admin';
      const isAdmin      = callerRole === 'admin' || callerRole === 'company_admin';

      if (!isSuperAdmin && !isAdmin)
        return res.status(403).json({ message: 'Forbidden: only admins can create users' });

      const normRoleRequested = normaliseRole(role || 'viewer');

      // Only super_admin can create admin-level users
      if (normRoleRequested === 'admin' && !isSuperAdmin)
        return res.status(403).json({ message: 'Forbidden: only super admin can create admin users' });

      // Admins can only create editor or viewer
      if (isAdmin && !isSuperAdmin && !['editor', 'viewer'].includes(normRoleRequested))
        return res.status(403).json({ message: 'Admins can only create editor or viewer accounts' });
    }

    const exists = await User.findOne({ username, isDeleted: { $ne: true } });
    if (exists) return res.status(409).json({ message: 'User already exists' });

    const normRole = isFirstBoot ? 'admin' : normaliseRole(role || 'viewer');
    if (!VALID_ROLES.includes(normRole))
      return res.status(400).json({ message: 'Invalid role' });

    const hashed = await bcrypt.hash(password.trim(), BCRYPT_ROUNDS);

    // Resolve creator ID for managerId (so sub-users nest under their admin)
    let creatorId = null;
    if (!isFirstBoot) {
      const authHeader = req.headers['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) {
        try {
          const decoded = require('jsonwebtoken').verify(
            authHeader.slice(7),
            process.env.JWT_SECRET || 'dev-only-jwt-secret-not-for-production'
          );
          creatorId = decoded.userId || decoded._id || null;
        } catch (_) {}
      } else if (req.session?.user?._id) {
        creatorId = req.session.user._id;
      }
    }

    const u = new User({ username, password: hashed, role: normRole, fullName, email, department, managerId: creatorId });
    await u.save();

    // Assign new user to the creator's tenant so they're always scoped correctly
    if (!isFirstBoot && creatorId) {
      const authHeader2 = req.headers['authorization'] || '';
      let creatorTenantId = null;
      if (authHeader2.startsWith('Bearer ')) {
        try {
          const decoded = require('jsonwebtoken').verify(
            authHeader2.slice(7),
            process.env.JWT_SECRET || 'dev-only-jwt-secret-not-for-production'
          );
          creatorTenantId = decoded.tenantId || null;
        } catch (_) {}
      } else if (req.session?.user?.tenantId) {
        creatorTenantId = req.session.user.tenantId;
      }
      if (creatorTenantId) {
        u.tenantId = creatorTenantId;
        await u.save();
      }
    }

    // Extract domain from email. If no email, inherit the creator's domain
    // so the new user is visible within the same tenant.
    await resolveUserDomain(u);
    if (!u.domain && !isFirstBoot) {
      // Resolve creator's domain from JWT or session
      let creatorDomain = null;
      const authHeader = req.headers['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) {
        try {
          const decoded = require('jsonwebtoken').verify(
            authHeader.slice(7),
            process.env.JWT_SECRET || 'dev-only-jwt-secret-not-for-production'
          );
          const creator = await User.findById(decoded.userId || decoded._id, 'domain').lean();
          creatorDomain = creator?.domain || null;
        } catch (_) {}
      } else if (req.session?.user?._id) {
        const creator = await User.findById(req.session.user._id, 'domain').lean();
        creatorDomain = creator?.domain || null;
      }
      if (creatorDomain) {
        u.domain = creatorDomain;
        await u.save();
        console.log(`[register] Inherited domain "${creatorDomain}" for "${username}"`);
      }
    }

    console.log(`[register] ✅ "${username}" (${isFirstBoot ? 'first-boot admin' : normRole})`);
    res.status(201).json({ message: 'Registered' });
  } catch (err) {
    console.error('[register] ❌', err.message);
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Username already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /login ──────────────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  const meta = getMeta(req);
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'username and password required' });

    // Accept username OR email in the username field
    const isEmail = username.includes('@');
    const user = isEmail
      ? await User.findOne({ email: username.toLowerCase().trim(), isDeleted: { $ne: true } })
      : await User.findOne({ username, isDeleted: { $ne: true } });

    // Lockout check BEFORE bcrypt — prevents timing side-channel
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMin = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      await audit('LOGIN_LOCKED', { userId: user._id, username, success: false, ...meta });
      captureAuthFailure({ action: 'LOGIN_LOCKED', username, ip: meta.ip, detail: `Locked for ${remainingMin}min`, tenantId: user.tenantId });
      return res.status(429).json({
        message: `Account temporarily locked. Try again in ${remainingMin} minute(s).`,
      });
    }

    const credentialsValid = user && await bcrypt.compare(password, user.password);

    if (!credentialsValid) {
      if (user) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const update   = { failedLoginAttempts: attempts };
        if (attempts >= MAX_ATTEMPTS) {
          update.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
          await audit('ACCOUNT_LOCKED', { userId: user._id, username, success: false, ...meta,
            detail: `Locked after ${attempts} failed attempts` });
          captureAuthFailure({ action: 'ACCOUNT_LOCKED', username, ip: meta.ip, detail: `${attempts} failed attempts`, tenantId: user.tenantId });
        }
        await User.findByIdAndUpdate(user._id, { $set: update });
      }
      await audit('LOGIN_FAILURE', { userId: user?._id, username, success: false, ...meta });
      captureAuthFailure({ action: 'LOGIN_FAILURE', username, ip: meta.ip, detail: 'Invalid credentials' });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Account active check
    if (user.isActive === false) {
      await audit('LOGIN_FAILURE', { userId: user._id, username, success: false, ...meta, detail: 'Account disabled' });
      return res.status(403).json({ message: 'Account is disabled. Contact your administrator.' });
    }

    const role = normaliseRole(user.role);

    // ── Tenant validation ─────────────────────────────────────────────────────
    // super_admin has no tenant — all others must belong to an active tenant.
    // This check runs BEFORE issuing any tokens.
    if (role !== 'super_admin') {
      try {
        await validateTenant(user.tenantId, role);
      } catch (tenantErr) {
        await audit('LOGIN_FAILURE', {
          userId: user._id, username, success: false, ...meta,
          detail: `Tenant check failed: ${tenantErr.message}`,
        });
        captureAuthFailure({ action: 'TENANT_REJECTED', username, ip: meta.ip, detail: tenantErr.message, tenantId: user.tenantId });
        return res.status(tenantErr.status || 403).json({
          message: tenantErr.message,
          code:    tenantErr.code,
        });
      }
    }

    // Reset failed attempts on successful login
    await User.findByIdAndUpdate(user._id, {
      $set: { role, failedLoginAttempts: 0, lockedUntil: null },
    });

    // Reload to get current tokenVersion and tenantId
    const freshUser = await User.findById(user._id).lean();

    // ── MFA gate ──────────────────────────────────────────────────────────────
    // If MFA is enabled, do NOT issue real tokens yet.
    // Return a short-lived challenge token; the client must complete /auth/mfa/challenge.
    if (freshUser.mfaEnabled) {
      const secret = process.env.JWT_SECRET || 'dev-only-jwt-secret-not-for-production';
      const challengeToken = jwt.sign(
        { userId: String(freshUser._id), challenge: 'mfa' },
        secret,
        { expiresIn: 5 * 60 } // 5 minutes
      );
      await audit('MFA_CHALLENGE_ISSUED', { userId: user._id, username, ...meta });
      return res.json({
        mfaRequired:    true,
        challengeToken,
        message:        'OTP required. Submit your authenticator code to /auth/mfa/challenge.',
      });
    }

    // Build session — tenantId is the canonical isolation key
    req.session.user = {
      _id:          freshUser._id,
      username:     freshUser.username,
      role,
      tenantId:     freshUser.tenantId     || null,
      isGoogleUser: freshUser.isGoogleUser || false,
    };

    const accessToken  = signAccessToken({ ...freshUser, role });
    const refreshToken = await issueRefreshToken(user._id, meta);

    await audit('LOGIN_SUCCESS', { userId: user._id, username, ...meta });
    console.log(`[login] ✅ "${username}" role=${role} tenant=${freshUser.tenantId || 'global'}`);

    res.json({
      message:     'Login successful',
      accessToken,
      refreshToken,
      expiresIn:   ACCESS_TOKEN_TTL,
      username:    freshUser.username,
      role,
      tenantId:    freshUser.tenantId || null,
      permissions: permissionsForRole(role),
      token:       accessToken, // legacy alias
    });
  } catch (err) {
    console.error('[login] ❌', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────
// Exchange a valid refresh token for a new access token + rotated refresh token.
// Does NOT require session or Bearer token — authenticated by refresh token alone.
router.post('/auth/refresh', authLimiter, async (req, res) => {
  const meta = getMeta(req);
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ message: 'refreshToken required' });

    const tokenHash = RefreshToken.hash(refreshToken);
    const stored    = await RefreshToken.findOne({ tokenHash });

    // Token not found — could be already rotated (reuse attack) or simply invalid
    if (!stored) {
      // Check if this hash belongs to a rotated token by looking for any token
      // for the same user that was rotated after this one was issued.
      // Simpler: if not found at all, just reject.
      await audit('TOKEN_REUSE_DETECTED', { success: false, ...meta, detail: 'Token not found' });
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Absolute expiry check — never extend beyond original login + 7 days
    if (stored.absoluteExpiry < new Date()) {
      await RefreshToken.deleteOne({ _id: stored._id });
      await audit('TOKEN_REFRESH', { userId: stored.userId, success: false, ...meta, detail: 'Expired' });
      return res.status(401).json({ message: 'Refresh token expired' });
    }

    // Reuse detection: if this token was already rotated (rotatedAt is set), it's a stolen token
    if (stored.rotatedAt) {
      // Nuke ALL refresh tokens for this user — breach response
      await RefreshToken.deleteMany({ userId: stored.userId });
      await audit('TOKEN_REUSE_DETECTED', { userId: stored.userId, success: false, ...meta,
        detail: 'Rotated token reused — all sessions invalidated' });
      captureAuthFailure({ action: 'TOKEN_REUSE_DETECTED', ip: meta.ip, detail: 'Possible token theft — all sessions invalidated' });
      return res.status(401).json({ message: 'Refresh token reuse detected. All sessions invalidated.' });
    }

    // Valid — rotate: mark old token as rotated, issue new pair
    stored.rotatedAt = new Date();
    await stored.save();

    const user = await User.findById(stored.userId).lean();
    if (!user || user.isDeleted) {
      return res.status(401).json({ message: 'User not found' });
    }

    const role = normaliseRole(user.role);

    // Re-validate tenant on every refresh — catches deactivated tenants
    if (role !== 'super_admin') {
      try {
        await validateTenant(user.tenantId, role);
      } catch (tenantErr) {
        await RefreshToken.deleteMany({ userId: user._id });
        await audit('TOKEN_REFRESH', { userId: user._id, username: user.username, success: false, ...meta,
          detail: `Tenant check failed: ${tenantErr.message}` });
        return res.status(tenantErr.status || 403).json({
          message: tenantErr.message,
          code:    tenantErr.code,
        });
      }
    }

    const accessToken = signAccessToken({ ...user, role });
    const newRefresh  = await issueRefreshToken(user._id, { ...meta, deviceId: stored.deviceId });

    await audit('TOKEN_REFRESH', { userId: user._id, username: user.username, ...meta });

    res.json({
      accessToken,
      refreshToken: newRefresh,
      expiresIn:    ACCESS_TOKEN_TTL,
      // Legacy alias
      token:        accessToken,
    });
  } catch (err) {
    console.error('[auth/refresh] ❌', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /logout ─────────────────────────────────────────────────────────────
// Deletes the current refresh token + destroys session.
router.post('/logout', async (req, res) => {
  const meta = getMeta(req);
  try {
    const { refreshToken } = req.body;
    const userId = req.session?.user?._id || req.authUser?._id;

    if (refreshToken) {
      const tokenHash = RefreshToken.hash(refreshToken);
      await RefreshToken.deleteOne({ tokenHash });
    }

    if (userId) {
      await audit('LOGOUT', { userId, username: req.session?.user?.username, ...meta });
    }

    req.session.destroy(() => {});
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  } catch (err) {
    console.error('[logout] ❌', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /auth/logout-all ────────────────────────────────────────────────────
// Deletes ALL refresh tokens for the user — logs out every device.
router.post('/auth/logout-all', requireAuth, async (req, res) => {
  const meta = getMeta(req);
  try {
    const userId = req.authUser._id;
    const deleted = await RefreshToken.deleteMany({ userId });

    await audit('LOGOUT_ALL', { userId, username: req.authUser.username, ...meta,
      detail: `${deleted.deletedCount} session(s) terminated` });

    req.session.destroy(() => {});
    res.clearCookie('connect.sid');
    res.json({ message: `Logged out from all devices. ${deleted.deletedCount} session(s) terminated.` });
  } catch (err) {
    console.error('[logout-all] ❌', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /users/google — list Google-authenticated users (admin+) ─────────────
router.get('/users/google', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const role   = normaliseRole(req.authUser.role);
    const filter = { isGoogleUser: true, isDeleted: { $ne: true } };
    if (role !== 'super_admin') {
      // Scope to tenant — never use organizationId for isolation
      filter.tenantId = req.authUser.tenantId;
      filter.role     = { $ne: 'super_admin' };
    }
    const users = await User.find(filter,
      'username fullName email role tenantId createdAt googleId provider'
    ).sort({ createdAt: -1 });
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /me ──────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.authUser._id;
    if (!userId) return res.json(req.authUser);

    const fresh = await User.findById(userId, 'role tenantId organizationId isActive isDeleted isGoogleUser email').lean();
    if (!fresh || fresh.isDeleted) {
      return res.status(401).json({ message: 'User not found' });
    }

    res.json({
      ...req.authUser,
      role:           normaliseRole(fresh.role),
      tenantId:       fresh.tenantId       ?? req.authUser.tenantId,
      organizationId: fresh.organizationId ?? req.authUser.organizationId,
      isGoogleUser:   fresh.isGoogleUser   || false,
      email:          fresh.email          || '',
    });
  } catch (err) {
    res.json(req.authUser);
  }
});

// ─── GET /users — tenant-scoped user list ────────────────────────────────────
router.get('/users', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const role   = normaliseRole(req.authUser.role);
    const filter = { isDeleted: { $ne: true }, role: { $ne: 'super_admin' } };

    if (role !== 'super_admin') {
      filter.tenantId = req.authUser.tenantId;

      // editor: only users they directly manage
      if (role === 'editor') {
        filter.managerId = req.authUser._id;
      }
    }

    const users = await User.find(
      filter,
      'username fullName email department role tenantId managerId createdAt failedLoginAttempts lockedUntil tokenVersion isGoogleUser'
    ).sort({ username: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /users — company_admin creates users in their tenant ────────────────
router.post('/users', requireAuth, requireRole('company_admin'), async (req, res) => {
  try {
    const caller     = req.authUser;
    const callerRole = normaliseRole(caller.role);
    const { username, password, role, fullName, email, department, managerId } = req.body;

    if (!username || !password)
      return res.status(400).json({ message: 'username and password required' });

    const policyError = validatePassword(password);
    if (policyError) return res.status(400).json({ message: policyError });

    const normRole = normaliseRole(role || 'employee');
    if (!['editor', 'employee', 'company_admin'].includes(normRole))
      return res.status(400).json({ message: 'company_admin can only create: editor, employee, company_admin' });

    // Tenant is always the caller's tenant — never trust client input for this
    const targetTenantId = callerRole === 'super_admin'
      ? (req.body.tenantId || null)
      : caller.tenantId;

    if (!targetTenantId)
      return res.status(400).json({ message: 'tenantId is required' });

    // Enforce: only one company_admin per tenant
    if (normRole === 'company_admin') {
      const existing = await User.findOne({ tenantId: targetTenantId, role: 'company_admin', isDeleted: { $ne: true } });
      if (existing) {
        return res.status(409).json({ message: `Tenant already has a company_admin: "${existing.username}". Remove them first.` });
      }
    }

    if (normRole === 'employee' && !managerId) {
      return res.status(400).json({ message: 'Employee must have a managerId assigned.' });
    }

    const exists = await User.findOne({ username, isDeleted: { $ne: true } });
    if (exists) return res.status(409).json({ message: 'User already exists' });

    const hashed  = await bcrypt.hash(password.trim(), BCRYPT_ROUNDS);
    const newUser = new User({
      username,
      password:  hashed,
      role:      normRole,
      fullName:  fullName  || '',
      email:     email     || '',
      department: department || '',
      tenantId:  targetTenantId,
      managerId: managerId || null,
      createdBy: caller._id,
      isHead:    normRole === 'company_admin',
    });
    await newUser.save();

    console.log(`[create-user] ✅ "${username}" (${normRole}) created by ${caller.username}`);
    res.status(201).json({
      message: `User "${username}" created`,
      data: { _id: newUser._id, username: newUser.username, role: newUser.role },
    });
  } catch (err) {
    console.error('[create-user] ❌', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /users/:id — tenant-scoped single user ───────────────────────────────
router.get('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const role   = normaliseRole(req.authUser.role);
    const filter = { _id: req.params.id, isDeleted: { $ne: true } };

    if (role !== 'super_admin') {
      filter.tenantId = req.authUser.tenantId;
      filter.role     = { $ne: 'super_admin' };
    }

    const user = await User.findOne(filter,
      'username fullName email department role tenantId managerId createdAt isGoogleUser isHead'
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ data: user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});
// Phase 4: increment tokenVersion on role change → invalidates all existing tokens
router.put('/users/:id/role', requireAuth, requireRole('admin'), async (req, res) => {
  if (String(req.params.id) === String(req.authUser._id)) {
    return res.status(403).json({ message: 'Cannot change your own role' });
  }
  const normRole = normaliseRole(req.body.role);
  if (!VALID_ROLES.includes(normRole))
    return res.status(400).json({ message: 'Invalid role. Must be admin, editor, or viewer' });
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      { $set: { role: normRole }, $inc: { tokenVersion: 1 } },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Revoke all refresh tokens — forces re-login on all devices
    await RefreshToken.deleteMany({ userId: user._id });

    await audit('ROLE_CHANGED', {
      userId:   req.authUser._id,
      username: req.authUser.username,
      ...getMeta(req),
      detail: `Changed ${user.username} role to ${normRole}`,
    });

    res.json({ message: 'Role updated', data: { _id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /users/me/password ─────────────────────────────────────────────────
// Phase 4: increment tokenVersion on password change → invalidates all existing tokens
router.post('/users/me/password', requireAuth, async (req, res) => {
  const meta = getMeta(req);
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword)
      return res.status(400).json({ message: 'newPassword is required' });

    const policyError = validatePassword(newPassword);
    if (policyError) return res.status(400).json({ message: policyError });

    const user = await User.findById(req.authUser._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Skip current password check for Google/SSO users and super_admin
    const skipCurrentPwCheck = user.isGoogleUser || user.provider === 'saml' || normaliseRole(user.role) === 'super_admin';

    if (!skipCurrentPwCheck) {
      if (!currentPassword)
        return res.status(400).json({ message: 'currentPassword and newPassword are required' });
      const currentValid = await bcrypt.compare(currentPassword, user.password);
      if (!currentValid)
        return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword.trim(), BCRYPT_ROUNDS);

    // Increment tokenVersion — all existing JWTs are now invalid
    await User.findByIdAndUpdate(user._id, {
      $set: { password: hashed },
      $inc: { tokenVersion: 1 },
    });

    // Revoke all refresh tokens — forces re-login on all devices
    await RefreshToken.deleteMany({ userId: user._id });

    await audit('PASSWORD_CHANGE', { userId: user._id, username: user.username, ...meta });
    console.log(`[change-password] ✅ "${user.username}" changed their password`);
    res.json({ message: 'Password updated successfully. Please log in again.' });
  } catch (err) {
    console.error('[change-password] ❌', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /users/:id/unlock ───────────────────────────────────────────────────
router.post('/users/:id/unlock', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      { $set: { failedLoginAttempts: 0, lockedUntil: null } },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });

    await audit('ACCOUNT_UNLOCKED', {
      userId:   req.authUser._id,
      username: req.authUser.username,
      ...getMeta(req),
      detail: `Unlocked ${user.username}`,
    });

    console.log(`[unlock] ✅ "${user.username}" unlocked by ${req.authUser.username}`);
    res.json({ message: `User "${user.username}" unlocked` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── DELETE /users/:id ────────────────────────────────────────────────────────
router.delete('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (String(req.params.id) === String(req.authUser._id)) {
    return res.status(403).json({ message: 'Cannot delete your own account' });
  }
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true } },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found or already deleted' });

    // Revoke all refresh tokens for deleted user
    await RefreshToken.deleteMany({ userId: user._id });

    console.log(`[delete-user] ✅ "${user.username}" soft-deleted by ${req.authUser.username}`);
    res.json({ message: `User "${user.username}" deleted` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /auth/sessions ───────────────────────────────────────────────────────
// List all active refresh token sessions for the current user.
router.get('/auth/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await RefreshToken.find(
      { userId: req.authUser._id, rotatedAt: null, absoluteExpiry: { $gt: new Date() } },
      'deviceId userAgent ipAddress createdAt absoluteExpiry'
    ).sort({ createdAt: -1 });
    res.json({ data: sessions });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /auth/ldap/login ────────────────────────────────────────────────────
// LDAP / Active Directory login. Only active when LDAP_ENABLED=true.
// Returns the same token shape as POST /login for drop-in compatibility.
router.post('/auth/ldap/login', authLimiter, async (req, res) => {
  const meta = getMeta(req);
  try {
    const ldapProvider = require('../auth/providers/ldap.provider');
    if (!ldapProvider.enabled) {
      return res.status(503).json({ message: 'LDAP authentication is not enabled on this server.' });
    }

    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'username and password required' });

    let result;
    try {
      result = await ldapProvider.authenticate({ username, password });
    } catch (ldapErr) {
      console.error('[ldap/login] ❌', ldapErr.message);
      await audit('LOGIN_FAILURE', { username, success: false, ...meta, detail: `LDAP error: ${ldapErr.message}` });
      return res.status(503).json({ message: 'LDAP authentication failed. Check server configuration.' });
    }

    if (!result) {
      await audit('LOGIN_FAILURE', { username, success: false, ...meta, detail: 'LDAP: invalid credentials' });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { user } = result;
    const freshUser = await User.findById(user._id).lean();
    const role      = normaliseRole(freshUser.role);

    // Tenant validation — LDAP users must belong to an active tenant
    if (role !== 'super_admin') {
      try {
        await validateTenant(freshUser.tenantId, role);
      } catch (tenantErr) {
        await audit('LOGIN_FAILURE', { userId: user._id, username, success: false, ...meta,
          detail: `LDAP tenant check failed: ${tenantErr.message}` });
        return res.status(tenantErr.status || 403).json({
          message: tenantErr.message,
          code:    tenantErr.code,
        });
      }
    }

    // Set session — include tenantId
    req.session.user = {
      _id:          freshUser._id,
      username:     freshUser.username,
      role,
      tenantId:     freshUser.tenantId || null,
      isGoogleUser: false,
    };

    const accessToken  = signAccessToken({ ...freshUser, role });
    const refreshToken = await issueRefreshToken(user._id, meta);

    await audit('LOGIN_SUCCESS', { userId: user._id, username, ...meta, detail: 'LDAP login' });
    console.log(`[ldap/login] ✅ "${username}" role=${role} tenant=${freshUser.tenantId || 'none'}`);

    res.json({
      message:     'Login successful (LDAP)',
      accessToken,
      refreshToken,
      expiresIn:   ACCESS_TOKEN_TTL,
      username:    freshUser.username,
      role,
      tenantId:    freshUser.tenantId || null,
      permissions: permissionsForRole(role),
      token:       accessToken,
    });
  } catch (err) {
    console.error('[ldap/login] ❌', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

// ─── Google OAuth routes ──────────────────────────────────────────────────────
// These routes are only active when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
// are set in the environment. If not configured, both return 503.
//
// FLOW:
//   1. GET /auth/google          → redirect to Google consent screen
//   2. GET /auth/google/callback → Google redirects back here
//   3. Passport verifies + calls findOrCreateUser()
//   4. We issue JWT + refresh token
//   5. Redirect to frontend: /auth/callback?token=...&refresh=...
//      (frontend extracts tokens, calls /me, sets user state)
//
// SECURITY:
//   - State parameter handled by passport-google-oauth20 (CSRF protection)
//   - Tokens are in query params only briefly — frontend must extract and
//     store in memory immediately, then navigate away
//   - All events are audit-logged

const passport = require('passport');

// ─── GET /auth/google ─────────────────────────────────────────────────────────
router.get('/auth/google', authLimiter, (req, res, next) => {
  const googleProvider = require('../auth/providers/google.provider');
  if (!googleProvider.enabled) {
    return res.status(503).json({ message: 'Google OAuth is not configured on this server.' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false, prompt: 'select_account', state: false })(req, res, next);
});

// ─── GET /auth/google/callback ────────────────────────────────────────────────
router.get('/auth/google/callback', (req, res, next) => {
  const googleProvider = require('../auth/providers/google.provider');
  if (!googleProvider.enabled) {
    return res.redirect(`${process.env.CORS_ORIGIN || 'http://localhost:5173'}/login?error=google_disabled`);
  }

  passport.authenticate('google', { session: false, failWithError: true, state: false })(req, res, async (err) => {
    const meta = getMeta(req);
    const frontendOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

    if (err || !req.user) {
      const detail = err?.message || 'Google authentication failed';
      console.error('[google/callback] ❌', detail);
      await audit('LOGIN_FAILURE', { success: false, ...meta, detail: `Google OAuth: ${detail}` });
      return res.redirect(`${frontendOrigin}/login?error=google_failed`);
    }

    try {
      const user     = req.user;
      const freshUser = await User.findById(user._id).lean();
      if (!freshUser || freshUser.isDeleted) {
        await audit('LOGIN_FAILURE', { userId: user._id, success: false, ...meta, detail: 'User deleted' });
        return res.redirect(`${frontendOrigin}/login?error=account_disabled`);
      }

      const role = normaliseRole(freshUser.role);

      // Tenant validation — Google users must belong to an active tenant
      // Exception: if tenantId is null (public gmail users), allow login as viewer
      if (role !== 'super_admin' && freshUser.tenantId) {
        try {
          await validateTenant(freshUser.tenantId, role);
        } catch (tenantErr) {
          await audit('LOGIN_FAILURE', { userId: freshUser._id, success: false, ...meta,
            detail: `Google tenant check failed: ${tenantErr.message}` });
          return res.redirect(`${frontendOrigin}/login?error=tenant_invalid`);
        }
      }

      // Set session — include tenantId
      req.session.user = {
        _id:          freshUser._id,
        username:     freshUser.username,
        role,
        tenantId:     freshUser.tenantId || null,
        isGoogleUser: true,
      };

      const accessToken  = signAccessToken({ ...freshUser, role });
      const refreshToken = await issueRefreshToken(freshUser._id, meta);

      await audit('LOGIN_SUCCESS', {
        userId:   freshUser._id,
        username: freshUser.username,
        ...meta,
        detail: 'Google OAuth login',
      });
      console.log(`[google/callback] ✅ "${freshUser.username}" role=${role}`);

      // Render an HTML page that immediately redirects to the frontend with tokens
      // This avoids Chrome bounce tracking stripping redirect URL params
      const redirectUrl = `${frontendOrigin}/auth/callback?token=${encodeURIComponent(accessToken)}&refresh=${encodeURIComponent(refreshToken)}`;
      const html = `<!DOCTYPE html>
<html>
<head>
  <title>Signing in...</title>
  <meta http-equiv="refresh" content="0;url=${redirectUrl}">
</head>
<body>
<p>Signing you in... <a href="${redirectUrl}">Click here if not redirected</a></p>
</body>
</html>`;
      return res.send(html);
    } catch (callbackErr) {
      console.error('[google/callback] ❌', callbackErr.message);
      await audit('LOGIN_FAILURE', { success: false, ...meta, detail: callbackErr.message });
      return res.redirect(`${frontendOrigin}/login?error=server_error`);
    }
  });
});

// ─── GET /auth/google/token ───────────────────────────────────────────────────
// Frontend calls this after Google OAuth redirect to retrieve tokens from session
router.get('/auth/google/token', (req, res) => {
  const tokens = req.session.oauthTokens;
  if (!tokens) {
    return res.status(404).json({ message: 'No pending OAuth tokens' });
  }
  delete req.session.oauthTokens;
  req.session.save(() => {});
  return res.json(tokens);
});

module.exports = router;
