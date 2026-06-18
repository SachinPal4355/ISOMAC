const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  employeeId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  assetId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Asset',    required: true },
  action:      { type: String, enum: ['assigned', 'returned'], required: true },
  date:        { type: Date, default: Date.now },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notes:       { type: String, default: '' },
  // ── Tenant isolation ─────────────────────────────────────────────────────
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
}, { timestamps: true });

module.exports = mongoose.model('EmployeeAssetHistory', historySchema);
