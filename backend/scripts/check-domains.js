require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const User = require('../models/User');
  const users = await User.find({ isDeleted: { $ne: true } }, 'username role email domain organizationId').lean();
  users.forEach(u => console.log(`${u.username.padEnd(20)} role=${u.role.padEnd(12)} email=${(u.email||'').padEnd(25)} domain=${u.domain||'null'}`));
  await mongoose.disconnect();
});
