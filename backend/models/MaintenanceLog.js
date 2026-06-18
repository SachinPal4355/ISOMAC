const mongoose = require('mongoose');

const maintenanceLogSchema = new mongoose.Schema({
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  type: { type: String, enum: ['Repair', 'Service', 'Inspection', 'Upgrade'], required: true },
  description: { type: String, required: true },
  cost: { type: Number, default: 0 },
  performedBy: { type: String, default: '' },
  scheduledDate: { type: Date },
  completedDate: { type: Date },
  status: { type: String, enum: ['Scheduled', 'In Progress', 'Completed'], default: 'Scheduled' },
  loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // ── Tenant isolation ─────────────────────────────────────────────────────
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   default: null, index: true },
  // ── Domain isolation (DEPRECATED — kept for migration) ───────────────────
  domain: { type: String, default: null, lowercase: true, trim: true },
}, { timestamps: true });

// Indexes for fast filtering
maintenanceLogSchema.index({ asset: 1 });
maintenanceLogSchema.index({ status: 1 });
maintenanceLogSchema.index({ scheduledDate: 1 }, { sparse: true });
maintenanceLogSchema.index({ createdAt: -1 });
maintenanceLogSchema.index({ tenantId: 1 }, { sparse: true });
maintenanceLogSchema.index({ domain: 1 }, { sparse: true }); // legacy

module.exports = mongoose.model('MaintenanceLog', maintenanceLogSchema);
