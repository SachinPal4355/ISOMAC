require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Asset = require('../models/Asset');

  const before = await Asset.countDocuments();
  console.log(`Assets + Accessories before: ${before}`);

  const result = await Asset.deleteMany({});
  console.log(`Deleted: ${result.deletedCount}`);

  const after = await Asset.countDocuments();
  console.log(`Remaining: ${after}`);

  await mongoose.disconnect();
}).catch(err => { console.error('Error:', err.message); process.exit(1); });
