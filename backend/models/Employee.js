const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  email:      { type: String, required: true, unique: true },
  phone:      { type: String, default: '' },
  department: { type: String, required: true },
  regionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Region', required: true },
  role:       { type: String, enum: ['Admin', 'User'], required: true },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  assets:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }],
  // customFields — typed values stored as Mixed (same as Asset model).
  // number → Number, date → Date, select/text → String
  customFields: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },

  // ── Tenant isolation ─────────────────────────────────────────────────────
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   default: null, index: true },
  // ── Domain isolation (DEPRECATED — kept for migration) ───────────────────
  domain: { type: String, default: null, lowercase: true, trim: true },
}, { timestamps: true });

// Indexes for fast filtering
employeeSchema.index({ regionId: 1 });
employeeSchema.index({ department: 1 });
employeeSchema.index({ status: 1 });
employeeSchema.index({ name: 1 });
employeeSchema.index({ tenantId: 1 }, { sparse: true });
employeeSchema.index({ domain: 1 }, { sparse: true }); // legacy

// Always serialize customFields as a plain object (matches Asset.js behaviour)
employeeSchema.set('toJSON', {
  transform: (_doc, ret) => {
    if (ret.customFields instanceof Map) {
      ret.customFields = Object.fromEntries(ret.customFields);
    }
    return ret;
  }
});

module.exports = mongoose.model('Employee', employeeSchema);
