require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const User = require('../models/User');
  const ne = { $ne: true };
  const users = await User.find({ isDeleted: ne }, 'username role organizationId').lean();
  users.forEach(u => console.log(JSON.stringify(u)));
  await mongoose.disconnect();
}).catch(err => { console.error('DB error:', err.message); process.exit(1); });
