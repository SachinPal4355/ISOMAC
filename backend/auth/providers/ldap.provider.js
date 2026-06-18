/**
 * ldap.provider.js — LDAP / Active Directory Authentication
 *
 * TENANT LINKING:
 *   - On auto-provision, resolves tenantId from the user's email domain
 *     against verified Tenant domains (same logic as google.provider.js).
 *   - If no verified tenant is found, tenantId is null.
 *     The user will be blocked at login until an admin assigns them to a tenant.
 *
 * ENV VARS:
 *   LDAP_ENABLED        — 'true' to activate (default: false)
 *   LDAP_URL            — e.g. ldap://dc.company.com:389
 *   LDAP_BASE_DN        — e.g. dc=company,dc=com
 *   LDAP_BIND_DN        — service account DN
 *   LDAP_BIND_PASS      — service account password
 *   LDAP_USER_FILTER    — e.g. (sAMAccountName={{username}})
 *   LDAP_DEFAULT_ROLE   — role for new LDAP users (default: viewer)
 *   LDAP_TLS_REJECT_UNAUTHORIZED — 'false' to skip cert check (dev only)
 */

const { Client } = require('ldapts');
const crypto = require('crypto');
const User   = require('../../models/User');
const Tenant = require('../../models/Tenant');
const { normaliseRole, PUBLIC_DOMAINS } = require('../../middleware/auth');

const ENABLED = process.env.LDAP_ENABLED === 'true';

/**
 * Resolve tenantId from a verified email domain.
 * Identical logic to google.provider.js — kept in sync.
 */
async function resolveTenantFromEmail(email) {
  if (!email || !email.includes('@')) return null;
  const emailDomain = email.split('@')[1].toLowerCase().trim();
  if (PUBLIC_DOMAINS.has(emailDomain)) return null;
  const tenant = await Tenant.findOne({
    isActive: true,
    domains: { $elemMatch: { domain: emailDomain, isVerified: true } },
  }, '_id').lean();
  return tenant ? tenant._id : null;
}

/**
 * Authenticate a user against LDAP/Active Directory.
 * Returns { user } on success, null on invalid credentials.
 * Throws on LDAP misconfiguration or unreachable server.
 */
async function authenticate({ username, password }) {
  if (!ENABLED) {
    throw new Error('LDAP provider is disabled. Set LDAP_ENABLED=true in .env to activate.');
  }

  const {
    LDAP_URL,
    LDAP_BASE_DN,
    LDAP_BIND_DN,
    LDAP_BIND_PASS,
    LDAP_USER_FILTER = '(sAMAccountName={{username}})',
    LDAP_DEFAULT_ROLE = 'viewer',
    LDAP_TLS_REJECT_UNAUTHORIZED,
  } = process.env;

  if (!LDAP_URL || !LDAP_BASE_DN || !LDAP_BIND_DN || !LDAP_BIND_PASS) {
    throw new Error('LDAP misconfigured: LDAP_URL, LDAP_BASE_DN, LDAP_BIND_DN, LDAP_BIND_PASS are required.');
  }

  const tlsOptions = LDAP_TLS_REJECT_UNAUTHORIZED === 'false'
    ? { rejectUnauthorized: false }
    : undefined;

  // Step 1: Bind with service account to search for the user
  const client = new Client({ url: LDAP_URL, tlsOptions, connectTimeout: 5000, timeout: 10000 });
  try {
    await client.bind(LDAP_BIND_DN, LDAP_BIND_PASS);
  } catch (err) {
    await client.unbind().catch(() => {});
    throw new Error('LDAP service account bind failed: ' + err.message);
  }

  // Step 2: Search for the user entry — sanitise username to prevent LDAP injection
  const safeUsername = username.replace(/[*()\\\x00]/g, '');
  const filter = LDAP_USER_FILTER.replace('{{username}}', safeUsername);
  let userDN;
  let ldapAttributes = {};

  try {
    const { searchEntries } = await client.search(LDAP_BASE_DN, {
      scope:      'sub',
      filter,
      attributes: ['dn', 'cn', 'mail', 'displayName', 'sAMAccountName', 'uid', 'userPrincipalName'],
      sizeLimit:  1,
    });
    if (!searchEntries.length) {
      await client.unbind().catch(() => {});
      return null;
    }
    userDN         = searchEntries[0].dn;
    ldapAttributes = searchEntries[0];
  } catch (err) {
    await client.unbind().catch(() => {});
    throw new Error('LDAP search failed: ' + err.message);
  }
  await client.unbind().catch(() => {});

  // Step 3: Bind as the user to verify their password
  const userClient = new Client({ url: LDAP_URL, tlsOptions, connectTimeout: 5000, timeout: 10000 });
  try {
    await userClient.bind(userDN, password);
    await userClient.unbind().catch(() => {});
  } catch (_) {
    await userClient.unbind().catch(() => {});
    return null; // wrong password
  }

  // Step 4: Find or create local User document
  let user = await User.findOne({ username, isDeleted: { $ne: true } });

  if (!user) {
    const email    = ldapAttributes.mail || ldapAttributes.userPrincipalName || '';
    const fullName = ldapAttributes.displayName || ldapAttributes.cn || username;
    const role     = normaliseRole(LDAP_DEFAULT_ROLE);
    const tenantId = await resolveTenantFromEmail(email);

    user = await User.create({
      username,
      email,
      fullName,
      role,
      tenantId:  tenantId || null,
      // Random hash — LDAP users never authenticate locally
      password:  crypto.randomBytes(32).toString('hex'),
    });

    console.log('[ldap] Auto-provisioned "' + username + '" (' + role + ') tenantId=' + (tenantId || 'none'));
  } else if (!user.tenantId) {
    // Backfill tenantId for existing LDAP users created before tenant migration
    const email    = ldapAttributes.mail || ldapAttributes.userPrincipalName || user.email || '';
    const tenantId = await resolveTenantFromEmail(email);
    if (tenantId) {
      await User.findByIdAndUpdate(user._id, { $set: { tenantId } });
      user = await User.findById(user._id).lean();
    }
  }

  return { user: { _id: user._id, username: user.username, role: user.role } };
}

async function findOrCreateUser() {
  throw new Error('LDAP provider uses authenticate() — findOrCreateUser is not applicable');
}

module.exports = { name: 'ldap', authenticate, findOrCreateUser, enabled: ENABLED };
