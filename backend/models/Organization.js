/**
 * Organization.js — Multi-tenant organization model
 *
 * Each organization is an isolated tenant.
 * All data (assets, employees, requests) is scoped to an organizationId.
 * Only super_admin can create organizations.
 * Only ONE company_admin is allowed per organization (enforced in routes).
 */
const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  slug:      { type: String, unique: true, lowercase: true, trim: true },
  // Email domain that maps to this org (e.g. "fintech.com").
  // Used to auto-link users on registration/OAuth.
  domain:    { type: String, default: null, lowercase: true, trim: true },
  isActive:  { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

organizationSchema.index({ name: 1 });
organizationSchema.index({ domain: 1 }, { sparse: true });

// Auto-generate slug from name before save
organizationSchema.pre('save', function(next) {
  if (this.isNew && !this.slug) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  next();
});

module.exports = mongoose.model('Organization', organizationSchema);
