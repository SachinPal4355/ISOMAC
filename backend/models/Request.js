/**
 * Request.js — Employee request workflow model
 *
 * Employees create requests (e.g. asset requests, IT support).
 * Editors/company_admins approve or reject them.
 * All requests are scoped to an organizationId.
 */
const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  title:          { type: String, required: true, trim: true },
  description:    { type: String, default: '' },
  requestedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  assignedTo:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status:         { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  rejectionReason:{ type: String, default: '' },
  // ── Tenant isolation ─────────────────────────────────────────────────────
  tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  // ── Domain isolation (DEPRECATED — kept for migration) ───────────────────
  domain: { type: String, default: null, lowercase: true, trim: true },
}, { timestamps: true });

requestSchema.index({ organizationId: 1, status: 1 });
requestSchema.index({ requestedBy: 1 });
requestSchema.index({ createdAt: -1 });
requestSchema.index({ domain: 1 }, { sparse: true });

module.exports = mongoose.model('Request', requestSchema);
