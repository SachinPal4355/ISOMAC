/**
 * fix-null-domains.js
 * Backfills domain: null users by inheriting from the most common non-public
 * domain in the system, or prompts you to specify one.
 *
 * Usage:
 *   node scripts/fix-null-domains.js                    # auto-detect
 *   node scripts/fix-null-domains.js reftab.com         # assign specific domain
 */
require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const User = require('../models/User');

  const nullUsers = await User.find({ domain: { $in: [null, undefined, ''] }, isDeleted: { $ne: true } }).lean();
  if (!nullUsers.length) { console.log('No users with null domain found.'); return mongoose.disconnect(); }

  console.log(`Found ${nullUsers.length} user(s) with no domain:`);
  nullUsers.forEach(u => console.log(` - ${u.username} (${u.email || 'no email'})`));

  // Determine target domain
  let targetDomain = process.argv[2];
  if (!targetDomain) {
    // Auto-detect: most common non-public domain among non-super_admin users
    const domainUsers = await User.find({ domain: { $ne: null }, role: { $ne: 'super_admin' } }, 'domain').lean();
    const counts = {};
    domainUsers.forEach(u => { if (u.domain && !u.domain.startsWith('public:')) counts[u.domain] = (counts[u.domain] || 0) + 1; });
    targetDomain = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  if (!targetDomain) { console.error('Could not determine target domain. Pass it as argument: node fix-null-domains.js yourdomain.com'); return mongoose.disconnect(); }

  console.log(`\nAssigning domain "${targetDomain}" to all null-domain users...`);
  const result = await User.updateMany(
    { domain: { $in: [null, undefined, ''] }, isDeleted: { $ne: true } },
    { $set: { domain: targetDomain } }
  );
  console.log(`✅ Updated ${result.modifiedCount} user(s)`);

  await mongoose.disconnect();
});
