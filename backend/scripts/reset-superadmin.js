/**
 * reset-superadmin.js
 * Resets the super admin password to whatever you pass as the first argument.
 *
 * Usage:
 *   node scripts/reset-superadmin.js <newPassword>
 *
 * Example:
 *   node scripts/reset-superadmin.js MyNewPass123
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');

const newPassword = process.argv[2];

if (!newPassword) {
  console.error('Usage: node scripts/reset-superadmin.js <newPassword>');
  process.exit(1);
}

if (newPassword.length < 8 || !/\d/.test(newPassword)) {
  console.error('Password must be at least 8 characters and contain at least 1 number.');
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const User = require('../models/User');

  const admin = await User.findOne({ role: 'super_admin' });
  if (!admin) {
    console.error('No super_admin user found in the database.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  admin.password             = hashed;
  admin.failedLoginAttempts  = 0;
  admin.lockedUntil          = null;
  admin.tokenVersion         = (admin.tokenVersion || 0) + 1; // invalidate all existing sessions
  await admin.save();

  console.log(`✅ Password reset for super_admin: "${admin.username}"`);
  console.log(`   Username : ${admin.username}`);
  console.log(`   New pass : ${newPassword}`);
  console.log(`   All existing sessions have been invalidated.`);

  await mongoose.disconnect();
}).catch(err => {
  console.error('DB error:', err.message);
  process.exit(1);
});
