const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action:       { type: String, required: true }, // e.g. 'CREATE_ASSET'
  entity:       { type: String, required: true }, // e.g. 'Asset'
  entityId:     { type: String, default: '' },
  // performedBy: username string (kept for display)
  performedBy:  { type: String, required: true },
  // performedById: ObjectId ref for precise attribution (fixes JWT audit gap)
  performedById:{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  details:      { type: mongoose.Schema.Types.Mixed, default: {} },
  ip:           { type: String, default: '' },
  // ── Tenant isolation (Phase 6 fix — was missing, caused cross-tenant leak) ─
  tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entity: 1, createdAt: -1 });
auditLogSchema.index({ performedBy: 1 });
auditLogSchema.index({ tenantId: 1, createdAt: -1 }); // tenant-scoped queries

module.exports = mongoose.model('AuditLog', auditLogSchema);
