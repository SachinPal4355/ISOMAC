/**
 * saml.provider.js — SAML 2.0 Single Sign-On
 *
 * Supports: Azure AD, Okta, Google Workspace (SAML), any SAML 2.0 IdP
 *
 * TENANT LINKING RULES (same as google.provider.js):
 *   - Resolves tenantId from the user's email domain against verified Tenant domains.
 *   - Domain MUST be verified on the tenant — unverified domains are rejected.
 *   - Public email providers (gmail.com etc.) are never auto-linked.
 *
 * ENV VARS:
 *   SAML_ENABLED       — 'true' to activate (default: false)
 *   SAML_ENTRY_POINT   — IdP SSO URL (e.g. https://login.microsoftonline.com/.../saml2)
 *   SAML_ISSUER        — SP Entity ID (e.g. https://isomac-production-5b81.up.railway.app)
 *   SAML_CERT          — IdP public certificate (PEM, base64 or raw — newlines as \n)
 *   SAML_CALLBACK_URL  — ACS URL (e.g. https://isomac-production-5b81.up.railway.app/auth/saml/callback)
 *   SAML_DEFAULT_ROLE  — role for new SAML users (default: viewer)
 */

const { Strategy: SamlStrategy } = require('@node-saml/passport-saml');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User   = require('../../models/User');
const Tenant = require('../../models/Tenant');
const { normaliseRole, PUBLIC_DOMAINS } = require('../../middleware/auth');

const ENABLED = process.env.SAML_ENABLED === 'true'
  && !!(process.env.SAML_ENTRY_POINT && process.env.SAML_CERT && process.env.SAML_CALLBACK_URL);

// ─── Tenant resolution (identical to google.provider.js) ─────────────────────
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

// ─── Extract email from SAML profile ─────────────────────────────────────────
// Different IdPs use different attribute names — we try them all.
function extractEmail(profile) {
  return (
    profile.email ||
    profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ||
    profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn'] ||
    profile.nameID ||
    null
  );
}

// ─── Extract display name from SAML profile ───────────────────────────────────
function extractName(profile) {
  return (
    profile.displayName ||
    profile['http://schemas.microsoft.com/identity/claims/displayname'] ||
    profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
    profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] ||
    null
  );
}

// ─── Find or create user from SAML profile ────────────────────────────────────
async function findOrCreateUser(profile) {
  if (!profile) throw new Error('SAML profile is missing');

  const rawEmail = extractEmail(profile);
  if (!rawEmail) throw new Error('SAML assertion did not include an email address.');

  const email    = rawEmail.toLowerCase().trim();
  const fullName = extractName(profile) || email.split('@')[0];
  const domain   = email.split('@')[1];

  // Resolve tenant — domain MUST be verified
  const tenantId = await resolveTenantFromEmail(email);

  // For SAML, we enforce domain verification strictly (unlike Google public users)
  // Public domains are allowed only if SAML_ALLOW_PUBLIC_DOMAINS=true
  if (!tenantId && !PUBLIC_DOMAINS.has(domain) && process.env.SAML_ALLOW_PUBLIC_DOMAINS !== 'true') {
    throw new Error(`Domain "${domain}" is not verified on any active tenant. Contact your administrator.`);
  }

  // Find existing user by email
  let user = await User.findOne({ email, isDeleted: { $ne: true } });

  if (user) {
    // Update name and backfill tenantId if missing
    let changed = false;
    if (user.fullName !== fullName) { user.fullName = fullName; changed = true; }
    if (!user.tenantId && tenantId) { user.tenantId = tenantId; changed = true; }
    if (user.provider !== 'saml') { user.provider = 'saml'; changed = true; }
    if (changed) await user.save();
    return user;
  }

  // Auto-provision new user
  const defaultRole = normaliseRole(process.env.SAML_DEFAULT_ROLE || 'viewer');
  let baseUsername  = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() || 'user';
  let username = baseUsername; let suffix = 1;
  while (await User.exists({ username })) { username = baseUsername + suffix; suffix++; }

  const randomPassword = await bcrypt.hash(crypto.randomBytes(64).toString('hex'), 10);
  user = await User.create({
    username,
    email,
    fullName,
    password:  randomPassword,
    role:      defaultRole,
    provider:  'saml',
    tenantId:  tenantId || null,
  });

  console.log(`[saml] Auto-provisioned "${username}" (${defaultRole}) tenantId=${tenantId || 'none'}`);
  return user;
}

// ─── Build Passport SAML strategy ────────────────────────────────────────────
function buildStrategy() {
  if (!ENABLED) return null;

  // Normalise cert — strip PEM headers if present, handle \n literals
  const rawCert = process.env.SAML_CERT
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');

  return new SamlStrategy(
    {
      entryPoint:   process.env.SAML_ENTRY_POINT,
      issuer:       process.env.SAML_ISSUER || process.env.SAML_CALLBACK_URL?.replace('/auth/saml/callback', ''),
      callbackUrl:  process.env.SAML_CALLBACK_URL,
      cert:         rawCert,
      wantAssertionsSigned: true,
      signatureAlgorithm:   'sha256',
      digestAlgorithm:      'sha256',
      // Disable session — we use JWT
      passReqToCallback: false,
    },
    // Verify callback (SSO login)
    async function(profile, done) {
      try {
        const user = await findOrCreateUser(profile);
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    },
    // Verify callback (SLO logout) — not used but required by passport-saml
    async function(profile, done) {
      return done(null, {});
    }
  );
}

module.exports = { name: 'saml', findOrCreateUser, buildStrategy, enabled: ENABLED };
