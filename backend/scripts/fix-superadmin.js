require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const User = require('../models/User');

  const result = await User.findOneAndUpdate(
    { username: 'sachinforoffice23' },
    { $set: { role: 'super_admin' } },
    { new: true }
  );

  if (result) {
    console.log('Fixed:', result.username, '→ role:', result.role);
  } else {
    console.log('User not found');
  }

  await mongoose.disconnect();
}).catch(err => { console.error('DB error:', err.message); process.exit(1); });
