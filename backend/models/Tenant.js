/**
 * Tenant.js — Single source of truth for multi-tenant isolation
 *
 * Replaces the Organization model as the canonical tenant record.
 * Every data document (Asset, Employee, etc.) references tenantId.
 *
 * Domain verification prevents email-spoofing attacks:
 *   - A domain is only trusted after DNS TXT record verification
 *   - OAuth/LDAP auto-provisioning only links users to verified domains
 */
const mongoose = require('mongoose');
const crypto   = require('crypto');

const domainEntrySchema = new mongoose.Schema({
  domain:     { type: String, required: true, lowercase: true, trim: true },
  isVerified: { type: Boolean, default: false },
  // DNS TXT record value the tenant must publish to prove domain ownership
  dnsToken:   { type: String, default: () => `isomac-verify=${crypto.randomBytes(16).toString('hex')}` },
  verifiedAt: { type: Date, default: null },
  addedAt:    { type: Date, default: Date.now },
}, { _id: false });

const tenantSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  slug:      { type: String, unique: true, lowercase: true, trim: true },
  isActive:  { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Verified email domains for this tenant.
  // Only verified domains are used for SSO auto-provisioning.
  domains: { type: [domainEntrySchema], default: [] },

  // Plan tier — used for feature gating
  plan: {
    type: String,
    enum: ['starter', 'growth', 'enterprise'],
    default: 'starter',
  },

  settings: {
    mfaRequired:    { type: Boolean, default: false },
    ssoOnly:        { type: Boolean, default: false },
    sessionTimeout: { type: Number,  default: 480 }, // minutes
  },
}, { timestamps: true });

// Auto-generate slug from name on first save
tenantSchema.pre('save', function (next) {
  if (this.isNew && !this.slug) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  next();
});

tenantSchema.index({ name: 1 });
tenantSchema.index({ 'domains.domain': 1 }, { sparse: true });
tenantSchema.index({ slug: 1 });

module.exports = mongoose.model('Tenant', tenantSchema);
