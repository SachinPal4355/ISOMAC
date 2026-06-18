const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['warranty_expiry', 'license_expiry', 'maintenance_due', 'low_stock', 'overdue_asset'],
    required: true
  },
  message: { type: String, required: true },
  severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status: { type: String, enum: ['unread', 'read'], default: 'unread' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', default: null },
  licenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'SoftwareLicense', default: null },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  // ── Tenant isolation ─────────────────────────────────────────────────────
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  // ── Domain isolation (DEPRECATED — kept for migration) ───────────────────
  domain: { type: String, default: null, lowercase: true, trim: true },
}, { timestamps: true });

// Index for fast unread queries
alertSchema.index({ status: 1, createdAt: -1 });
alertSchema.index({ assetId: 1 });
alertSchema.index({ tenantId: 1 }, { sparse: true });
alertSchema.index({ domain: 1 }, { sparse: true }); // legacy

module.exports = mongoose.model('Alert', alertSchema);
