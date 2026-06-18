/**
 * google.provider.js — Google OAuth2 Authentication
 *
 * TENANT LINKING RULES:
 *   - Only links a user to a tenant if the email domain is VERIFIED on that tenant.
 *   - Public email providers (gmail.com etc.) are never auto-linked to any tenant.
 *   - New users provisioned without a verified tenant get tenantId: null.
 *     They will be blocked at login until an admin assigns them to a tenant.
 */

const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User   = require('../../models/User');
const Tenant = require('../../models/Tenant');
const { normaliseRole, PUBLIC_DOMAINS } = require('../../middleware/auth');

const ENABLED = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

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

async function findOrCreateUser(profile) {
  if (!profile) throw new Error('Google profile is missing');
  const googleId = profile.id;
  const rawEmail = profile.emails && profile.emails[0] && profile.emails[0].value;
  if (!rawEmail) throw new Error('Google account did not provide an email address.');
  const email    = rawEmail.toLowerCase().trim();
  const fullName = profile.displayName || email.split('@')[0];

  let user = await User.findOne({ googleId: googleId, isDeleted: { $ne: true } });
  if (user) {
    let changed = false;
    if (user.email !== email || user.fullName !== fullName) { user.email = email; user.fullName = fullName; changed = true; }
    if (!user.tenantId) { const tid = await resolveTenantFromEmail(email); if (tid) { user.tenantId = tid; changed = true; } }
    if (changed) await user.save();
    return user;
  }

  user = await User.findOne({ email: email, isDeleted: { $ne: true } });
  if (user) {
    user.googleId = googleId; user.isGoogleUser = true; user.provider = 'google';
    if (!user.tenantId) { const tid = await resolveTenantFromEmail(email); if (tid) user.tenantId = tid; }
    await user.save();
    return user;
  }

  const defaultRole = normaliseRole(process.env.GOOGLE_DEFAULT_ROLE || 'editor');
  const tenantId    = await resolveTenantFromEmail(email);
  let baseUsername  = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() || 'user';
  let username = baseUsername; let suffix = 1;
  while (await User.exists({ username: username })) { username = baseUsername + suffix; suffix++; }
  const randomPassword = await bcrypt.hash(crypto.randomBytes(64).toString('hex'), 10);
  user = await User.create({ username, email, fullName, password: randomPassword, role: defaultRole, googleId, provider: 'google', isGoogleUser: true, tenantId: tenantId || null });
  console.log('[google] Auto-provisioned "' + username + '" (' + defaultRole + ') tenantId=' + (tenantId || 'none'));
  return user;
}

function buildStrategy() {
  if (!ENABLED) return null;
  return new GoogleStrategy(
    { clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback', proxy: true },
    async function(_at, _rt, profile, done) { try { return done(null, await findOrCreateUser(profile)); } catch (err) { return done(err, null); } }
  );
}

module.exports = { name: 'google', findOrCreateUser: findOrCreateUser, buildStrategy: buildStrategy, enabled: ENABLED };
