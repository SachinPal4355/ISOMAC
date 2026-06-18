require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/inventory').then(async () => {
  const User   = require('../models/User');
  const Tenant = require('../models/Tenant');

  const tenants = await Tenant.find({}, 'name slug isActive').lean();
  console.log('\n=== TENANTS ===');
  console.log(JSON.stringify(tenants, null, 2));

  const users = await User.find({ isDeleted: { $ne: true } }, 'username email role tenantId isActive').lean();
  console.log('\n=== USERS ===');
  console.log(JSON.stringify(users, null, 2));

  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
