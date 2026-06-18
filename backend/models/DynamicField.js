const mongoose = require('mongoose');

/**
 * DynamicField — unified schema for all entity field definitions.
 * Replaces EmployeeField and AssetCategoryField.
 *
 * entityType : 'asset' | 'employee'
 * category   : only relevant for assets (e.g. "Laptop"); empty for employees
 * isFixed    : system fields that cannot be deleted or renamed
 */
const dynamicFieldSchema = new mongoose.Schema({
  entityType: { type: String, enum: ['asset', 'employee', 'accessory'], required: true },
  category:   { type: String, default: '' },   // '' for employees; category name for assets
  name:       { type: String, required: true }, // internal key, e.g. "ram"
  label:      { type: String, required: true }, // display name, e.g. "RAM"
  type:       { type: String, enum: ['text', 'number', 'date', 'select'], default: 'text' },
  required:   { type: Boolean, default: false },
  visible:    { type: Boolean, default: true },
  order:      { type: Number, required: true },
  options:    { type: [String], default: [] },
  isFixed:    { type: Boolean, default: false },
  group:      { type: String, default: '' },        // e.g. "Basic Info", "Technical Specs"
  editableBy: { type: String, enum: ['admin', 'it_staff', 'all'], default: 'all' },
  // Schema evolution tracking
  fieldVersion: { type: Number, default: 1 },
  // Soft-delete: deleted fields are hidden from UI but kept for data integrity
  isDeleted:    { type: Boolean, default: false },
  deletedAt:    { type: Date, default: null },
  // Track previous type so we can warn on type changes
  previousType: { type: String, default: null },
  // ── Tenant isolation ─────────────────────────────────────────────────────
  // null = system-wide default fields (seeded on boot, visible to all tenants)
  // ObjectId = tenant-specific custom fields
  tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
}, { timestamps: true });

// Compound unique index: one field name per (entityType, category)
dynamicFieldSchema.index({ entityType: 1, category: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('DynamicField', dynamicFieldSchema);
