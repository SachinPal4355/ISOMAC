const mongoose = require('mongoose');

const pdfSchema = new mongoose.Schema({
  filename:    String,
  data:        Buffer,
  contentType: String,
  uploadDate:  { type: Date, default: Date.now },
  // ── Tenant isolation ─────────────────────────────────────────────────────
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  // ── Ownership (for users with no tenant) ─────────────────────────────────
  uploadedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
});

module.exports = mongoose.model('PDF', pdfSchema);
