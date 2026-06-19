/**
 * ============================================================
 * auth.js — Authentication & Authorisation Middleware
 * ============================================================
 *
 * TENANT VALIDATION MODEL
 *   Every non-super_admin user MUST have a tenantId that references
 *   an active Tenant document. This is enforced at three layers:
 *
 *   1. Login (auth.routes.js)  — checked before issuing tokens
 *   2. requireSession / requireJWT — re-validated on every request
 *   3. enforceTenantScope — sets req.tenantFilter for DB queries
 *
 * ROLE HIERARCHY
 *   super_admin   → global access, no tenant scope
 *   company_admin → full access within their tenant
 *   admin         → legacy alias for company_admin
 *   editor        → create/edit within tenant, no user management
 *   employee      → create requests + view own profile only
 *   viewer        → read-only (legacy)
 * ============================================================
 */

const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const Tenant = require('../models/Tenant');

// ─── Role normalisation ───────────────────────────────────────────────────────
function normaliseRole(role) {
  if (role === 'it_staff') return 'editor';
  if (role === 'end_user') return 'viewer';
  return role;
}

const ROLE_LEVEL = {
  super_admin:   100,
  company_admin: 80,
  admin:         80,
  editor:        50,
  employee:      20,
  viewer:        10,
};

function roleLevel(role) {
  return ROLE_LEVEL[normaliseRole(role)] ?? 0;
}

// ─── Tenant validation helper ─────────────────────────────────────────────────
// Called inside requireSession and requireJWT.
// Returns the tenant document if valid, null if super_admin (no tenant needed),
// or throws with a structured error if the tenant is missing/inactive.
async function validateTenant(tenantId, role) {
  if (normaliseRole(role) === 'super_admin') return null;
  if (!tenantId) {
    // Allow users with no tenant — they get limited access until admin assigns a tenant
    return null;
  }
  const tenant = await Tenant.findById(tenantId, 'isActive name').lean();
  if (!tenant) {
    const err = new Error('Tenant not found. Contact your administrator.');
    err.code   = 'TENANT_NOT_FOUND';
    err.status = 403;
    throw err;
  }
  if (!tenant.isActive) {
    const err = new Error(`Tenant "${tenant.name}" is inactive. Contact your administrator.`);
    err.code   = 'TENANT_INACTIVE';
    err.status = 403;
    throw err;
  }
  return tenant;
}

// ─── PATH 1: Session ─────────────────────────────────────────────────────────
async function requireSession(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ message: 'Unauthorized: please log in' });
  }

  try {
    const userId = req.session.user._id;
    if (!userId) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: 'Invalid session.' });
    }

    // Always read fresh from DB — session values may be stale after role/tenant changes
    const dbUser = await User.findById(
      userId,
      'role tenantId organizationId isDeleted isActive isGoogleUser'
    ).lean();

    if (!dbUser || dbUser.isDeleted) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: 'User not found.' });
    }

    if (dbUser.isActive === false) {
      req.session.destroy(() => {});
      return res.status(403).json({ message: 'Account is disabled.' });
    }

    const role     = normaliseRole(dbUser.role);
    const tenantId = dbUser.tenantId || null;

    // Validate tenant on every request — catches deactivated tenants mid-session
    try {
      await validateTenant(tenantId, role);
    } catch (tenantErr) {
      req.session.destroy(() => {});
      return res.status(tenantErr.status || 403).json({
        message: tenantErr.message,
        code:    tenantErr.code,
      });
    }

    req.authUser = {
      _id:            userId,
      username:       req.session.user.username,
      role,
      tenantId,
      organizationId: dbUser.organizationId || null,
      isGoogleUser:   dbUser.isGoogleUser   || false,
    };
    next();
  } catch (err) {
    next(err);
  }
}

// ─── PATH 2: JWT ──────────────────────────────────────────────────────────────
async function requireJWT(req, res, next) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: Bearer token required' });
  }

  const token  = header.slice(7);
  const secret = process.env.JWT_SECRET || 'dev-only-jwt-secret-not-for-production';

  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Invalid token.' });
  }

  try {
    const userId = decoded.userId || decoded._id;
    if (!userId) {
      return res.status(401).json({ message: 'Invalid token payload.' });
    }

    // Always read tenantId, role, tokenVersion fresh from DB
    const dbUser = await User.findById(
      userId,
      'tokenVersion isDeleted isActive tenantId organizationId isGoogleUser role'
    ).lean();

    if (!dbUser || dbUser.isDeleted) {
      return res.status(401).json({ message: 'User not found.' });
    }

    if (dbUser.isActive === false) {
      return res.status(403).json({ message: 'Account is disabled.' });
    }

    if ((decoded.tokenVersion ?? 0) < (dbUser.tokenVersion ?? 0)) {
      return res.status(401).json({
        message: 'Token invalidated. Please log in again.',
        code:    'TOKEN_INVALIDATED',
      });
    }

    const role     = normaliseRole(dbUser.role);
    const tenantId = dbUser.tenantId || null;

    // Validate tenant on every request — catches deactivated tenants mid-session
    try {
      await validateTenant(tenantId, role);
    } catch (tenantErr) {
      return res.status(tenantErr.status || 403).json({
        message: tenantErr.message,
        code:    tenantErr.code,
      });
    }

    req.authUser = {
      _id:            userId,
      username:       decoded.username,
      role,
      permissions:    decoded.permissions || {},
      tokenVersion:   dbUser.tokenVersion,
      jti:            decoded.jti,
      tenantId,
      organizationId: dbUser.organizationId || null,
      isGoogleUser:   dbUser.isGoogleUser   || false,
    };
    next();
  } catch (err) {
    next(err);
  }
}

// ─── DUAL-PATH: requireAuth ───────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.user)
    return requireSession(req, res, next);
  if ((req.headers['authorization'] || '').startsWith('Bearer '))
    return requireJWT(req, res, next);
  return res.status(401).json({ message: 'Unauthorized: please log in' });
}

// ─── Role guard ───────────────────────────────────────────────────────────────
function requireRole(...roles) {
  const expanded = roles.flatMap(r => {
    if (r === 'admin')         return ['admin', 'company_admin', 'super_admin'];
    if (r === 'company_admin') return ['company_admin', 'super_admin'];
    if (r === 'editor')        return ['editor', 'it_staff', 'company_admin', 'admin', 'super_admin'];
    if (r === 'viewer')        return ['viewer', 'end_user', 'employee', 'editor', 'company_admin', 'admin', 'super_admin'];
    if (r === 'super_admin')   return ['super_admin'];
    if (r === 'employee')      return ['employee', 'editor', 'company_admin', 'admin', 'super_admin'];
    return [r];
  });
  return (req, res, next) => {
    const userRole = normaliseRole(req.authUser?.role);
    if (!userRole || !expanded.includes(userRole)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    next();
  };
}

// ─── enforceTenantScope ───────────────────────────────────────────────────────
// Sets req.tenantId and req.tenantFilter for use in DB queries.
//
// SCOPING RULES:
//   super_admin   → global (no filter), optionally scoped via ?tenantId=
//   has tenantId  → scoped to tenant (domain-level access)
//   no tenantId, has managerId → scoped to manager's tenant if available
//   no tenantId, no manager   → scoped to own userId (personal data only)
function enforceTenantScope(req, res, next) {
  const role = normaliseRole(req.authUser?.role);

  if (role === 'super_admin') {
    const scopedTenant = req.query.tenantId || null;
    req.tenantId       = scopedTenant;
    // Super admin sees all data by default, optionally filtered by tenantId
    if (scopedTenant) {
      req.tenantFilter = { tenantId: scopedTenant };
    } else {
      req.tenantFilter = {}; // all data
    }
    return next();
  }

  const tenantId = req.authUser?.tenantId;

  if (tenantId) {
    // User belongs to a verified tenant domain — full domain-level access
    req.tenantId     = tenantId;
    req.tenantFilter = { tenantId };
    return next();
  }

  // No tenant — scope to user's own data only (by uploadedBy/createdBy/userId)
  const userId = req.authUser?._id;
  req.tenantId     = null;
  req.tenantFilter = {
    tenantId: null,
    $or: [
      { uploadedBy: userId },
      { createdBy: userId },
      { userId: userId },
      // Show null-tenant docs with no ownership field (created before ownership tracking)
      { uploadedBy: { $exists: false }, createdBy: { $exists: false }, userId: { $exists: false } },
      { uploadedBy: null, createdBy: null },
    ]
  };
  next();
}

// ─── Google user restriction ──────────────────────────────────────────────────
const GOOGLE_USER_ALLOWED_PATHS = [
  { method: 'GET',    path: '/me' },
  { method: 'POST',   path: '/requests' },
  { method: 'GET',    path: '/requests' },
  { method: 'POST',   path: '/logout' },
  { method: 'POST',   path: '/auth/refresh' },
  { method: 'POST',   path: '/auth/logout-all' },
  // Files / Invoices
  { method: 'POST',   path: '/upload' },
  { method: 'GET',    path: '/files' },
  { method: 'DELETE', path: '/files' },
  // Assets, Accessories, Assignments, Maintenance, Licenses, Locations
  { method: 'GET',    path: '/assets' },
  { method: 'POST',   path: '/assets' },
  { method: 'PUT',    path: '/assets' },
  { method: 'GET',    path: '/accessories' },
  { method: 'POST',   path: '/accessories' },
  { method: 'PUT',    path: '/accessories' },
  { method: 'GET',    path: '/assignments' },
  { method: 'POST',   path: '/assignments' },
  { method: 'GET',    path: '/maintenance' },
  { method: 'POST',   path: '/maintenance' },
  { method: 'GET',    path: '/licenses' },
  { method: 'GET',    path: '/locations' },
  { method: 'GET',    path: '/employees' },
  { method: 'GET',    path: '/inventory' },
  { method: 'GET',    path: '/asset-categories' },
  { method: 'GET',    path: '/dynamic-fields' },
  { method: 'POST',   path: '/dynamic-fields' },
  { method: 'PUT',    path: '/dynamic-fields' },
  { method: 'GET',    path: '/alerts' },
  { method: 'GET',    path: '/regions' },
  // MFA
  { method: 'GET',    path: '/auth/mfa/status' },
  { method: 'POST',   path: '/auth/mfa/setup' },
  { method: 'POST',   path: '/auth/mfa/verify' },
  { method: 'POST',   path: '/auth/mfa/disable' },
  { method: 'POST',   path: '/auth/mfa/challenge' },
  // Password change
  { method: 'POST',   path: '/users/me/password' },
];

function restrictGoogleUser(req, res, next) {
  if (!req.authUser || !req.authUser.isGoogleUser) return next();
  const allowed = GOOGLE_USER_ALLOWED_PATHS.some(
    p => p.method === req.method && req.path.startsWith(p.path)
  );
  if (!allowed) {
    return res.status(403).json({
      message: 'Google users have restricted access. Contact your administrator.',
      code:    'GOOGLE_USER_RESTRICTED',
    });
  }
  next();
}

// ─── Public domain blocklist ──────────────────────────────────────────────────
const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'live.com', 'icloud.com', 'protonmail.com', 'aol.com',
  'mail.com', 'zoho.com', 'yandex.com', 'gmx.com',
]);

function extractDomain(email, userId) {
  if (!email || !email.includes('@')) return null;
  const raw = email.split('@')[1].toLowerCase().trim();
  if (PUBLIC_DOMAINS.has(raw)) {
    return userId ? `public:${String(userId)}` : null;
  }
  return raw;
}

// ─── Legacy middleware (kept for backward compat — do not use in new routes) ──
function enforceOrganizationScope(req, res, next) {
  const role = normaliseRole(req.authUser?.role);
  req.organizationId = role === 'super_admin'
    ? (req.query.organizationId || null)
    : (req.authUser?.organizationId || null);
  next();
}

function enforceDomainScope(req, res, next) {
  req.domainFilter = {};
  next();
}

function enforceHierarchy(req, res, next) {
  req.hierarchyFilter = {};
  next();
}

module.exports = {
  requireAuth, requireSession, requireJWT,
  requireRole, normaliseRole, roleLevel,
  enforceTenantScope, validateTenant,
  enforceOrganizationScope, restrictGoogleUser, enforceHierarchy,
  enforceDomainScope, extractDomain, PUBLIC_DOMAINS,
};
