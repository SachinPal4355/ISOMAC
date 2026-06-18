const mongoose = require('mongoose');

const regionSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true },
  departments: { type: [String], default: [] },
  // ── Tenant isolation ─────────────────────────────────────────────────────
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
}, { timestamps: true });

module.exports = mongoose.model('Region', regionSchema);
