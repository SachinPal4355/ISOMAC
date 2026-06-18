require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const User = require('../models/User');

  // Simulate what GET /users does for Aman
  const aman = await User.findOne({ username: 'Aman' }, 'domain organizationId role').lean();
  console.log('Aman DB record:', JSON.stringify(aman));

  // What filter would be built?
  const callerDomain = aman?.domain;
  const callerOrgId  = aman?.organizationId;
  console.log('callerDomain:', callerDomain);
  console.log('callerOrgId:', callerOrgId);

  const filter = { isDeleted: { $ne: true }, role: { $ne: 'super_admin' } };
  if (callerDomain) {
    filter.domain = callerDomain;
  } else if (callerOrgId) {
    filter.organizationId = callerOrgId;
  } else {
    filter._id = aman._id;
  }

  console.log('Filter:', JSON.stringify(filter));

  const results = await User.find(filter, 'username email domain role').lean();
  console.log('Results:');
  results.forEach(u => console.log(' -', u.username, u.email, 'domain:', u.domain));

  await mongoose.disconnect();
});
