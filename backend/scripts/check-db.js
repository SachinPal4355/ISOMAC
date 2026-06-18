require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Asset = require('../models/Asset');
  const Assignment = require('../models/Assignment');
  const Maintenance = require('../models/MaintenanceLog');
  const User = require('../models/User');
  const AssetCategory = require('../models/AssetCategory');

  const ne = { $ne: true };
  const [assets, accessories, assignments, maintenance, users, categories] = await Promise.all([
    Asset.countDocuments({ type: 'asset', isDeleted: ne }),
    Asset.countDocuments({ type: 'accessory', isDeleted: ne }),
    Assignment.countDocuments(),
    Maintenance.countDocuments(),
    User.countDocuments({ isDeleted: ne }),
    AssetCategory.countDocuments()
  ]);

  console.log('Assets:', assets);
  console.log('Accessories:', accessories);
  console.log('Assignments:', assignments);
  console.log('Maintenance:', maintenance);
  console.log('Users:', users);
  console.log('Categories:', categories);

  const u = await User.findOne({ username: 'sachinforoffice23' }, 'username role organizationId').lean();
  console.log('Super admin user:', JSON.stringify(u));

  await mongoose.disconnect();
}).catch(err => { console.error('DB error:', err.message); process.exit(1); });
