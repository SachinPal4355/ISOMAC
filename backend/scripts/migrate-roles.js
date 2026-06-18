/**
 * One-time migration: it_staff → editor, end_user → viewer
 * Run: node scripts/migrate-roles.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const db = mongoose.connection.db;
  const col = db.collection('users');

  const r1 = await col.updateMany({ role: 'it_staff' }, { $set: { role: 'editor' } });
  const r2 = await col.updateMany({ role: 'end_user' }, { $set: { role: 'viewer' } });

  console.log(`✅ it_staff → editor: ${r1.modifiedCount} users`);
  console.log(`✅ end_user → viewer: ${r2.modifiedCount} users`);

  const users = await col.find({}, { projection: { username: 1, role: 1 } }).toArray();
  console.log('\nAll users after migration:');
  users.forEach(u => console.log(`  ${u.username} (${u.role})`));

  process.exit(0);
}).catch(err => { console.error(err.message); process.exit(1); });
