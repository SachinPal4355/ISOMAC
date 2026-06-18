/**
 * saml.routes.js — SAML 2.0 SSO Routes
 *
 * GET  /auth/saml/login    → Redirect to IdP (Azure AD / Okta / Google Workspace)
 * POST /auth/saml/callback → ACS endpoint — IdP posts SAML response here
 * GET  /auth/saml/metadata → SP metadata XML (for IdP configuration)
 */

const express  = require('express');
const passport = require('passport');
const User     = require('../models/User');
const AuthAuditLog = require('../models/AuthAuditLog');
const { normaliseRole, validateTenant } = require('../middleware/auth');
const { signAccessToken, issueRefreshToken } = require('../lib/auth.helpers');

const router = express.Router();

// ─── Audit helper ─────────────────────────────────────────────────────────────
async function audit(action, { userId, username, success = true, ip, userAgent, detail } = {}) {
  try {
    await AuthAuditLog.create({
      userId:   userId   || null,
      username: username || '',
      action,
      success,
      metadata: { ip: ip || '', userAgent: userAgent || '', detail: detail || '' },
    });
  } catch (_) {}
}

function getMeta(req) {
  return {
    ip:        req.ip || req.headers['x-forwarded-for'] || '',
    userAgent: req.headers['user-agent'] || '',
  };
}

// ─── GET /auth/saml/login ─────────────────────────────────────────────────────
// Redirects browser to the IdP login page
router.get('/auth/saml/login', (req, res, next) => {
  const samlProvider = require('../auth/providers/saml.provider');
  if (!samlProvider.enabled) {
    return res.status(503).json({ message: 'SAML SSO is not configured on this server.' });
  }
  passport.authenticate('saml', { session: false, failWithError: true })(req, res, next);
});

// ─── POST /auth/saml/callback (ACS endpoint) ──────────────────────────────────
// IdP posts the SAML response here after successful authentication
router.post('/auth/saml/callback', (req, res, next) => {
  const samlProvider = require('../auth/providers/saml.provider');
  const frontendOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

  if (!samlProvider.enabled) {
    return res.redirect(`${frontendOrigin}/login?error=saml_disabled`);
  }

  passport.authenticate('saml', { session: false, failWithError: true })(req, res, async (err) => {
    const meta = getMeta(req);

    if (err || !req.user) {
      const detail = err?.message || 'SAML authentication failed';
      console.error('[saml/callback] ❌', detail);
      await audit('SAML_LOGIN_FAILURE', { success: false, ...meta, detail });
      return res.redirect(`${frontendOrigin}/login?error=${encodeURIComponent(detail)}`);
    }

    try {
      const freshUser = await User.findById(req.user._id).lean();
      if (!freshUser || freshUser.isDeleted) {
        await audit('SAML_LOGIN_FAILURE', { userId: req.user._id, success: false, ...meta, detail: 'User deleted' });
        return res.redirect(`${frontendOrigin}/login?error=account_disabled`);
      }

      const role = normaliseRole(freshUser.role);

      // Tenant validation — SAML users must belong to an active tenant
      if (role !== 'super_admin' && freshUser.tenantId) {
        try {
          await validateTenant(freshUser.tenantId, role);
        } catch (tenantErr) {
          await audit('SAML_LOGIN_FAILURE', { userId: freshUser._id, success: false, ...meta,
            detail: `Tenant check failed: ${tenantErr.message}` });
          return res.redirect(`${frontendOrigin}/login?error=tenant_invalid`);
        }
      }

      const accessToken  = signAccessToken({ ...freshUser, role });
      const refreshToken = await issueRefreshToken(freshUser._id, meta);

      await audit('SAML_LOGIN_SUCCESS', {
        userId:   freshUser._id,
        username: freshUser.username,
        ...meta,
        detail: 'SAML SSO login',
      });
      console.log(`[saml/callback] ✅ "${freshUser.username}" role=${role} tenant=${freshUser.tenantId || 'none'}`);

      // Use meta-refresh to avoid Chrome bounce tracking stripping tokens
      const redirectUrl = `${frontendOrigin}/auth/callback?token=${encodeURIComponent(accessToken)}&refresh=${encodeURIComponent(refreshToken)}`;
      return res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Signing in...</title>
  <meta http-equiv="refresh" content="0;url=${redirectUrl}">
</head>
<body><p>Signing you in... <a href="${redirectUrl}">Click here if not redirected</a></p></body>
</html>`);

    } catch (callbackErr) {
      console.error('[saml/callback] ❌', callbackErr.message);
      await audit('SAML_LOGIN_FAILURE', { success: false, ...meta, detail: callbackErr.message });
      return res.redirect(`${frontendOrigin}/login?error=server_error`);
    }
  });
});

// ─── GET /auth/saml/metadata ──────────────────────────────────────────────────
// Returns SP metadata XML — paste this into your IdP configuration
router.get('/auth/saml/metadata', (req, res) => {
  const samlProvider = require('../auth/providers/saml.provider');
  if (!samlProvider.enabled) {
    return res.status(503).json({ message: 'SAML SSO is not configured.' });
  }

  try {
    const passport = require('passport');
    const strategy = passport._strategy('saml');
    if (!strategy) return res.status(503).json({ message: 'SAML strategy not registered.' });

    const metadata = strategy.generateServiceProviderMetadata(null, null);
    res.type('application/xml');
    res.send(metadata);
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate metadata: ' + err.message });
  }
});

module.exports = router;
