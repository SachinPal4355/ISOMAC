const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  parent:      { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
  description: { type: String, default: '' },
  address:     { type: String, default: '' },
  // ── Tenant isolation ─────────────────────────────────────────────────────
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   default: null, index: true },
  // ── Domain isolation (DEPRECATED — kept for migration) ───────────────────
  domain:      { type: String, default: null, lowercase: true, trim: true },
}, { timestamps: true });

locationSchema.index({ tenantId: 1 }, { sparse: true });
locationSchema.index({ domain: 1 }, { sparse: true }); // legacy

module.exports = mongoose.model('Location', locationSchema);
