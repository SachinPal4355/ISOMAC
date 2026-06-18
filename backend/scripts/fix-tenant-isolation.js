/**
 * fix-tenant-isolation.js
 * Creates separate tenants per email domain and reassigns users accordingly.
 * Users without an email domain get their own tenant based on username.
 */
require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/inventory').then(async () => {
  const User   = require('../models/User');
  const Tenant = require('../models/Tenant');

  const superAdmin = await User.findOne({ role: 'super_admin' }).lean();
  if (!superAdmin) { console.error('No super_admin found'); process.exit(1); }

  const users = await User.find({ role: { $ne: 'super_admin' }, isDeleted: { $ne: true } }).lean();
  console.log(`Found ${users.length} non-super_admin users`);

  // Group users by email domain (or by managerId chain)
  // First pass: find all admin users and their domains
  const adminUsers = users.filter(u => u.role === 'admin' || u.role === 'company_admin');
  const subUsers   = users.filter(u => u.role !== 'admin' && u.role !== 'company_admin');

  // Build domain → tenantId map
  const domainTenantMap = {};

  for (const admin of adminUsers) {
    const domain = admin.email ? admin.email.split('@')[1]?.toLowerCase() : null;
    const key    = domain || `user-${admin._id}`;

    if (!domainTenantMap[key]) {
      // Find or create a tenant for this domain
      const slug = key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      let tenant = await Tenant.findOne({ slug });
      if (!tenant) {
        const result = await Tenant.collection.insertOne({
          name:      domain ? domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1) : admin.username,
          slug,
          isActive:  true,
          createdBy: superAdmin._id,
          plan:      'enterprise',
          domains:   domain ? [{ domain, isVerified: true, verifiedAt: new Date(), addedAt: new Date() }] : [],
          settings:  { mfaRequired: false, ssoOnly: false, sessionTimeout: 480 },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        tenant = await Tenant.findById(result.insertedId);
        console.log(`✅ Created tenant "${tenant.name}" (${tenant._id}) for domain "${key}"`);
      } else {
        console.log(`ℹ️  Reusing tenant "${tenant.name}" (${tenant._id}) for domain "${key}"`);
      }
      domainTenantMap[key] = tenant._id;
    }

    // Assign admin to their tenant
    await User.findByIdAndUpdate(admin._id, { $set: { tenantId: domainTenantMap[key] } });
    console.log(`  → ${admin.username} (${admin.role}) assigned to tenant ${domainTenantMap[key]}`);
  }

  // Second pass: assign sub-users to their manager's tenant
  for (const sub of subUsers) {
    let tenantId = null;

    // Try to find via managerId
    if (sub.managerId) {
      const manager = await User.findById(sub.managerId, 'tenantId email').lean();
      tenantId = manager?.tenantId || null;
    }

    // Fallback: match by email domain
    if (!tenantId && sub.email) {
      const domain = sub.email.split('@')[1]?.toLowerCase();
      if (domain && domainTenantMap[domain]) {
        tenantId = domainTenantMap[domain];
      }
    }

    // Last resort: assign to first available tenant
    if (!tenantId && Object.keys(domainTenantMap).length > 0) {
      tenantId = Object.values(domainTenantMap)[0];
    }

    if (tenantId) {
      await User.findByIdAndUpdate(sub._id, { $set: { tenantId } });
      console.log(`  → ${sub.username} (${sub.role}) assigned to tenant ${tenantId}`);
    }
  }

  // Final state
  console.log('\n=== Final user → tenant mapping ===');
  const allUsers = await User.find({ isDeleted: { $ne: true } }, 'username role email tenantId').lean();
  const tenants  = await Tenant.find({}, 'name _id').lean();
  const tMap     = Object.fromEntries(tenants.map(t => [String(t._id), t.name]));
  allUsers.forEach(u => {
    console.log(`  ${u.username} (${u.role}) → ${u.tenantId ? tMap[String(u.tenantId)] || u.tenantId : 'none'}`);
  });

  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
