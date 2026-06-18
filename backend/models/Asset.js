const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  assetTag:      { type: String, unique: true, required: true },
  name:          { type: String, required: true },
  category:      { type: String, required: true },
  brand:         { type: String, default: '' },
  model:         { type: String, default: '' },
  serialno:      { type: String, default: '' },
  purchaseDate:  { type: Date },
  purchaseCost:  { type: Number, default: 0 },
  warrantyExpiry:{ type: Date },
  status: {
    type: String,
    enum: ['Available', 'Assigned', 'In Repair', 'Retired', 'Missing'],
    default: 'Available'
  },
  location:    { type: String, default: '' },
  locationRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
  notes:       { type: String, default: '' },
  assignedTo:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  employeeRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  // customFields — typed values stored as Mixed (not String) to preserve Number/Date fidelity.
  // field.type === 'number' → stored as Number
  // field.type === 'date'   → stored as Date
  // field.type === 'select' | 'text' → stored as String
  customFields: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  // quantity — for bulk/consumable items (accessories, peripherals)
  quantity:    { type: Number, default: 1, min: 0 },
  // source — tracks origin of record (manual, import, migrated)
  source:      { type: String, default: 'manual' },
  // type — 'asset' for laptops/computers, 'accessory' for peripherals
  type:        { type: String, enum: ['asset', 'accessory'], default: 'asset' },

  // ── Tenant isolation ─────────────────────────────────────────────────────
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  // ── Domain isolation (DEPRECATED — kept for migration) ───────────────────
  domain:      { type: String, default: null, lowercase: true, trim: true },

  // ── Soft delete ──────────────────────────────────────────────────────────
  // Hard deletes are forbidden — asset history, assignments, and audit logs
  // reference asset IDs. Soft-delete preserves referential integrity.
  isDeleted:   { type: Boolean, default: false },
  deletedAt:   { type: Date,    default: null },
}, { timestamps: true });

// ─── Indexes for 5000+ record performance ────────────────────────────────────
assetSchema.index({ type: 1, category: 1 });
assetSchema.index({ type: 1, status: 1 });
assetSchema.index({ type: 1, createdAt: -1 });
assetSchema.index({ serialno: 1 }, { sparse: true });
assetSchema.index({ assignedTo: 1 }, { sparse: true });
assetSchema.index({ employeeRef: 1 }, { sparse: true });
assetSchema.index({ warrantyExpiry: 1 }, { sparse: true });
assetSchema.index({ isDeleted: 1 });
assetSchema.index({ tenantId: 1 }, { sparse: true }); // tenant isolation
assetSchema.index({ domain: 1 }, { sparse: true }); // legacy — migration period

// Always serialize customFields as a plain object so frontend can use bracket notation
assetSchema.set('toJSON', {
  transform: (_doc, ret) => {
    if (ret.customFields instanceof Map) {
      ret.customFields = Object.fromEntries(ret.customFields);
    }
    return ret;
  }
});

module.exports = mongoose.model('Asset', assetSchema);
