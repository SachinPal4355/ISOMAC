const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username:   { type: String, unique: true, required: true },
  password:   { type: String, required: true },

  // ── Role system ───────────────────────────────────────────────────────────
  // Legacy roles (admin, editor, viewer) kept for backward compatibility.
  // New multi-tenant roles: super_admin, company_admin, employee
  // Role hierarchy: super_admin > company_admin > editor > employee > viewer
  role: {
    type: String,
    enum: ['super_admin', 'company_admin', 'admin', 'editor', 'employee', 'viewer'],
    default: 'viewer',
  },

  fullName:   { type: String, default: '' },
  email:      { type: String, default: '' },
  department: { type: String, default: '' },
  isDeleted:  { type: Boolean, default: false },

  // ── Tenant isolation (single source of truth) ────────────────────────────
  // tenantId replaces domain + organizationId as the canonical isolation key.
  // null only for super_admin. All other roles must have a tenantId.
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },

  // ── Legacy fields (kept during migration — do NOT use for new queries) ────
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  domain: { type: String, default: null, lowercase: true, trim: true },

  // Manager in the org hierarchy (company_admin → editor → employee)
  managerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Who created this user
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // ── Login protection ──────────────────────────────────────────────────────
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil:         { type: Date,   default: null },

  // ── Token versioning ──────────────────────────────────────────────────────
  // Incremented on password change or role change.
  // All JWTs carrying an older tokenVersion are immediately rejected.
  tokenVersion: { type: Number, default: 0 },

  // ── SSO providers ─────────────────────────────────────────────────────────
  googleId:     { type: String,  default: null },
  provider:     { type: String,  enum: ['local', 'google', 'ldap'], default: 'local' },
  isGoogleUser: { type: Boolean, default: false },

  // ── Company head ──────────────────────────────────────────────────────────
  // true only for the company_admin who is the designated head of the org
  isHead:       { type: Boolean, default: false },

  // ── Hierarchy (3-level RBAC) ──────────────────────────────────────────────
  // adminId: for employees — points to the company_admin who owns them
  // This is the primary ownership field for data isolation.
  adminId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // isActive: soft enable/disable without deleting
  isActive:     { type: Boolean, default: true },

  // ── MFA (TOTP) ────────────────────────────────────────────────────────────
  // mfaEnabled: true once the user has verified their TOTP setup
  // mfaSecret:  base32 TOTP secret — stored encrypted at rest via env key
  // mfaSecretPending: temporary secret during setup, cleared after verify
  mfaEnabled:        { type: Boolean, default: false },
  mfaSecret:         { type: String,  default: null, select: false }, // never returned by default
  mfaSecretPending:  { type: String,  default: null, select: false },
}, { timestamps: true });

userSchema.index({ username: 1, isDeleted: 1 });
userSchema.index({ tenantId: 1, role: 1 });
userSchema.index({ organizationId: 1, role: 1 }); // legacy — kept during migration
userSchema.index({ domain: 1 });
userSchema.index({ adminId: 1 });
userSchema.index({ googleId: 1 }, { sparse: true });
userSchema.index({ email: 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);
