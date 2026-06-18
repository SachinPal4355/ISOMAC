/**
 * fix-tenants.js
 * Creates a default tenant and assigns all non-super_admin users to it.
 * Safe to run multiple times (idempotent).
 */
require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/inventory').then(async () => {
  const User   = require('../models/User');
  const Tenant = require('../models/Tenant');

  // Find or create the default tenant
  let tenant = await Tenant.findOne({ slug: 'default' });
  if (!tenant) {
    // Need a super_admin as createdBy
    const superAdmin = await User.findOne({ role: 'super_admin' }).lean();
    if (!superAdmin) {
      console.error('No super_admin found — cannot create tenant.');
      process.exit(1);
    }
    // Use insertOne to bypass pre-save hook issues
    const result = await Tenant.collection.insertOne({
      name:      'Default',
      slug:      'default',
      isActive:  true,
      createdBy: superAdmin._id,
      plan:      'enterprise',
      domains:   [],
      settings:  { mfaRequired: false, ssoOnly: false, sessionTimeout: 480 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    tenant = await Tenant.findById(result.insertedId);
    console.log(`✅ Created tenant "Default" (${tenant._id})`);
  } else {
    console.log(`ℹ️  Tenant "Default" already exists (${tenant._id})`);
  }

  // Assign all users without a tenantId (except super_admin) to this tenant
  const result = await User.updateMany(
    { role: { $ne: 'super_admin' }, tenantId: null },
    { $set: { tenantId: tenant._id } }
  );
  console.log(`✅ Assigned ${result.modifiedCount} user(s) to tenant "${tenant.name}"`);

  // Verify
  const users = await User.find({ isDeleted: { $ne: true } }, 'username role tenantId').lean();
  console.log('\nUser → Tenant mapping:');
  users.forEach(u => console.log(`  ${u.username} (${u.role}) → tenantId: ${u.tenantId || 'none (super_admin)'}`));

  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
