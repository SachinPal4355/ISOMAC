const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedAt: { type: Date, default: Date.now },
  returnedAt: { type: Date, default: null },
  notes: { type: String, default: '' },
  status: { type: String, enum: ['Active', 'Returned'], default: 'Active' },
  // ── Tenant isolation ─────────────────────────────────────────────────────
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   default: null, index: true },
  // ── Domain isolation (DEPRECATED — kept for migration) ───────────────────
  domain: { type: String, default: null, lowercase: true, trim: true },
}, { timestamps: true });

// Indexes for fast lookups
assignmentSchema.index({ asset: 1 });
assignmentSchema.index({ assignedTo: 1 });
assignmentSchema.index({ status: 1, assignedAt: -1 });
assignmentSchema.index({ tenantId: 1 }, { sparse: true });
assignmentSchema.index({ domain: 1 }, { sparse: true }); // legacy

module.exports = mongoose.model('Assignment', assignmentSchema);
