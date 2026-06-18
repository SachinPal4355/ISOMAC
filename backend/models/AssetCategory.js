const mongoose = require('mongoose');

function toSlug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const assetCategorySchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  slug:      { type: String, unique: true },
  icon:      { type: String, default: '' },
  type:      { type: String, enum: ['asset', 'accessory'], default: 'asset' },
  isActive:  { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // ── Tenant isolation ─────────────────────────────────────────────────────
  // null = system default categories; ObjectId = tenant-specific categories
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
}, { timestamps: true });

// Auto-generate slug before save
assetCategorySchema.pre('save', async function () {
  if (this.isModified('name') || !this.slug) {
    this.slug = toSlug(this.name);
  }
});

module.exports = mongoose.model('AssetCategory', assetCategorySchema);
module.exports.toSlug = toSlug;
