const mongoose = require('mongoose');

const assetCategoryFieldSchema = new mongoose.Schema({
  category: { type: String, required: true },          // e.g. "Laptop"
  name:     { type: String, required: true },          // internal key, e.g. "ram"
  label:    { type: String, required: true },          // display name, e.g. "RAM"
  type:     { type: String, enum: ['text', 'number', 'date', 'select'], default: 'text' },
  required: { type: Boolean, default: false },
  visible:  { type: Boolean, default: true },
  order:    { type: Number, required: true },
  options:  { type: [String], default: [] },
  isFixed:  { type: Boolean, default: false },         // fixed fields cannot be deleted/renamed
}, { timestamps: true });

assetCategoryFieldSchema.index({ category: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('AssetCategoryField', assetCategoryFieldSchema);
