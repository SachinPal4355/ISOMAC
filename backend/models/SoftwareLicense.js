const mongoose = require('mongoose');

const softwareLicenseSchema = new mongoose.Schema({
  softwareName: { type: String, required: true },
  licenseKey: { type: String, default: '' },
  vendor: { type: String, default: '' },
  licenseType: { type: String, enum: ['Perpetual', 'Subscription', 'OEM', 'Open Source'], default: 'Subscription' },
  seats: { type: Number, default: 1 },
  usedSeats: { type: Number, default: 0 },
  purchaseDate: { type: Date },
  expiryDate: { type: Date },
  cost: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Expired', 'Cancelled'], default: 'Active' },
  notes: { type: String, default: '' },
  assignedAssets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }],
  // ── Tenant isolation ─────────────────────────────────────────────────────
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   default: null, index: true },
  // ── Domain isolation (DEPRECATED — kept for migration) ───────────────────
  domain: { type: String, default: null, lowercase: true, trim: true },
}, { timestamps: true });

// Indexes for alert checks
softwareLicenseSchema.index({ status: 1 });
softwareLicenseSchema.index({ expiryDate: 1 }, { sparse: true });
softwareLicenseSchema.index({ tenantId: 1 }, { sparse: true });
softwareLicenseSchema.index({ domain: 1 }, { sparse: true }); // legacy

module.exports = mongoose.model('SoftwareLicense', softwareLicenseSchema);
