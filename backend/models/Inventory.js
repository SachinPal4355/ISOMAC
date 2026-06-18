const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  itemName: String,
  serialno: { type: String, index: true },
  name: String,
  email: String,
  purchaseDate: Date,
  status: String,
  comment: { type: String, default: '' },
  actionType: { type: String, default: 'Add' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Inventory', inventorySchema);
