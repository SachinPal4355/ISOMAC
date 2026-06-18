const mongoose = require('mongoose');

const employeeFieldSchema = new mongoose.Schema({
  name:     { type: String, required: true, unique: true },
  label:    { type: String, required: true },
  type:     { type: String, enum: ['text', 'number', 'date', 'select'], required: true },
  required: { type: Boolean, default: false },
  visible:  { type: Boolean, default: true },
  order:    { type: Number, required: true },
  options:  { type: [String], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('EmployeeField', employeeFieldSchema);
