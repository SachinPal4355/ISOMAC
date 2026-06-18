/**
 * migrate-domain.js
 *
 * One-time migration: backfill the `domain` field on all existing records.
 *
 * Strategy:
 *   1. For each User with an email, compute domain and save it.
 *   2. For each Asset/Employee/Assignment/MaintenanceLog/SoftwareLicense/Location/Alert/Request
 *      that has no domain, try to infer it from the creator or linked user.
 *      Fall back to the first user's domain if only one tenant exists.
 *
 * Run once: node scripts/migrate-domain.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'live.com', 'icloud.com', 'protonmail.com', 'aol.com',
]);

function extractDomain(email, userId) {
  if (!email || !email.includes('@')) return null;
  const raw = email.split('@')[1].toLowerCase().trim();
  if (PUBLIC_DOMAINS.has(raw)) return userId ? `public:${String(userId)}` : null;
  return raw;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const User           = require('../models/User');
  const Asset          = require('../models/Asset');
  const Employee       = require('../models/Employee');
  const Assignment     = require('../models/Assignment');
  const MaintenanceLog = require('../models/MaintenanceLog');
  const SoftwareLicense = require('../models/SoftwareLicense');
  const Location       = require('../models/Location');
  const Alert          = require('../models/Alert');
  const Request        = require('../models/Request');
  const Organization   = require('../models/Organization');

  // ── Step 1: Backfill User.domain ──────────────────────────────────────────
  console.log('\n[1/9] Backfilling User.domain...');
  const users = await User.find({ email: { $ne: '' }, isDeleted: { $ne: true } });
  let userFixed = 0;
  for (const u of users) {
    const domain = extractDomain(u.email, u._id);
    if (!domain || u.domain === domain) continue;
    u.domain = domain;
    // Link org by domain
    if (!domain.startsWith('public:') && !u.organizationId) {
      const org = await Organization.findOne({ domain, isActive: true }).lean();
      if (org) u.organizationId = org._id;
    }
    await u.save();
    userFixed++;
  }
  console.log(`   Fixed ${userFixed} users`);

  // Build a domain lookup: userId → domain (for stamping data records)
  const allUsers = await User.find({}, '_id domain email').lean();
  const userDomainMap = new Map();
  for (const u of allUsers) {
    if (u.domain) userDomainMap.set(String(u._id), u.domain);
  }

  // Determine the "default" domain for single-tenant setups
  // (all non-public domains used by non-super_admin users)
  const nonSuperUsers = await User.find({ role: { $ne: 'super_admin' }, domain: { $ne: null } }, 'domain').lean();
  const domainCounts = {};
  for (const u of nonSuperUsers) {
    if (u.domain && !u.domain.startsWith('public:')) {
      domainCounts[u.domain] = (domainCounts[u.domain] || 0) + 1;
    }
  }
  const dominantDomain = Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  console.log(`   Dominant domain for legacy data: "${dominantDomain}"`);

  // ── Step 2: Assets ────────────────────────────────────────────────────────
  console.log('\n[2/9] Backfilling Asset.domain...');
  const assets = await Asset.find({ domain: { $in: [null, undefined, ''] } });
  let assetFixed = 0;
  for (const a of assets) {
    const domain = (a.assignedTo && userDomainMap.get(String(a.assignedTo))) || dominantDomain;
    if (domain) { a.domain = domain; await a.save(); assetFixed++; }
  }
  console.log(`   Fixed ${assetFixed} assets`);

  // ── Step 3: Employees ─────────────────────────────────────────────────────
  console.log('\n[3/9] Backfilling Employee.domain...');
  const employees = await Employee.find({ domain: { $in: [null, undefined, ''] } });
  let empFixed = 0;
  for (const e of employees) {
    const domain = extractDomain(e.email, null) || dominantDomain;
    if (domain) { e.domain = domain; await e.save(); empFixed++; }
  }
  console.log(`   Fixed ${empFixed} employees`);

  // ── Step 4: Assignments ───────────────────────────────────────────────────
  console.log('\n[4/9] Backfilling Assignment.domain...');
  const assignments = await Assignment.find({ domain: { $in: [null, undefined, ''] } });
  let asgFixed = 0;
  for (const a of assignments) {
    const domain = (a.assignedBy && userDomainMap.get(String(a.assignedBy)))
                || (a.assignedTo && userDomainMap.get(String(a.assignedTo)))
                || dominantDomain;
    if (domain) { a.domain = domain; await a.save(); asgFixed++; }
  }
  console.log(`   Fixed ${asgFixed} assignments`);

  // ── Step 5: MaintenanceLogs ───────────────────────────────────────────────
  console.log('\n[5/9] Backfilling MaintenanceLog.domain...');
  const logs = await MaintenanceLog.find({ domain: { $in: [null, undefined, ''] } });
  let logFixed = 0;
  for (const l of logs) {
    const domain = (l.loggedBy && userDomainMap.get(String(l.loggedBy))) || dominantDomain;
    if (domain) { l.domain = domain; await l.save(); logFixed++; }
  }
  console.log(`   Fixed ${logFixed} maintenance logs`);

  // ── Step 6: SoftwareLicenses ──────────────────────────────────────────────
  console.log('\n[6/9] Backfilling SoftwareLicense.domain...');
  const licenses = await SoftwareLicense.find({ domain: { $in: [null, undefined, ''] } });
  let licFixed = 0;
  for (const l of licenses) {
    if (dominantDomain) { l.domain = dominantDomain; await l.save(); licFixed++; }
  }
  console.log(`   Fixed ${licFixed} licenses`);

  // ── Step 7: Locations ─────────────────────────────────────────────────────
  console.log('\n[7/9] Backfilling Location.domain...');
  const locations = await Location.find({ domain: { $in: [null, undefined, ''] } });
  let locFixed = 0;
  for (const l of locations) {
    if (dominantDomain) { l.domain = dominantDomain; await l.save(); locFixed++; }
  }
  console.log(`   Fixed ${locFixed} locations`);

  // ── Step 8: Alerts ────────────────────────────────────────────────────────
  console.log('\n[8/9] Backfilling Alert.domain...');
  const alerts = await Alert.find({ domain: { $in: [null, undefined, ''] } });
  let alertFixed = 0;
  for (const a of alerts) {
    const domain = (a.userId && userDomainMap.get(String(a.userId))) || dominantDomain;
    if (domain) { a.domain = domain; await a.save(); alertFixed++; }
  }
  console.log(`   Fixed ${alertFixed} alerts`);

  // ── Step 9: Requests ──────────────────────────────────────────────────────
  console.log('\n[9/9] Backfilling Request.domain...');
  const requests = await Request.find({ domain: { $in: [null, undefined, ''] } });
  let reqFixed = 0;
  for (const r of requests) {
    const domain = (r.requestedBy && userDomainMap.get(String(r.requestedBy))) || dominantDomain;
    if (domain) { r.domain = domain; await r.save(); reqFixed++; }
  }
  console.log(`   Fixed ${reqFixed} requests`);

  console.log('\n✅ Domain migration complete');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
