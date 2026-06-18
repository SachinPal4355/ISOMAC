/**
 * mfa.routes.js — TOTP Multi-Factor Authentication
 *
 * FLOW:
 *   Setup:
 *     1. POST /auth/mfa/setup   → generates secret + QR code URL
 *     2. User scans QR in authenticator app (Google Auth, Authy, etc.)
 *     3. POST /auth/mfa/verify  → user submits first OTP to confirm setup
 *        → mfaEnabled = true, mfaSecretPending cleared
 *
 *   Login (when mfaEnabled = true):
 *     1. POST /login            → credentials valid → returns { mfaRequired: true, mfaChallengeToken }
 *     2. POST /auth/mfa/challenge → user submits OTP + challengeToken → returns real access/refresh tokens
 *
 *   Disable:
 *     POST /auth/mfa/disable    → requires current OTP to prevent accidental/malicious disable
 *
 * SECURITY:
 *   - mfaSecret stored with select: false — never returned in normal queries
 *   - mfaSecretPending cleared immediately after verify
 *   - Challenge token is a short-lived JWT (5 min) with { challenge: 'mfa' } claim
 *   - Rate-limited: same authLimiter as login (15 attempts / 15 min)
 *   - OTP window: ±1 step (30s tolerance for clock skew)
 *
 * INSTALL: npm install otplib
 */

const express = require('express');
const jwt     = require('jsonwebtoken');
const QRCode  = require('qrcode');
const { authenticator } = require('otplib');
const rateLimit = require('express-rate-limit');

const User         = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const AuthAuditLog = require('../models/AuthAuditLog');
const { requireAuth, normaliseRole } = require('../middleware/auth');
const { captureAuthFailure } = require('../lib/sentry');
const { signAccessToken, issueRefreshToken, ACCESS_TOKEN_TTL } = require('../lib/auth.helpers');

const router = express.Router();

const APP_NAME = process.env.MFA_APP_NAME || 'ISOMAC';
const JWT_SECRET = () => process.env.JWT_SECRET || 'dev-only-jwt-secret-not-for-production';
const MFA_CHALLENGE_TTL = 5 * 60; // 5 minutes in seconds

// Strict rate limiter for MFA endpoints — brute-force protection
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many MFA attempts. Try again in 15 minutes.' },
});

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

// ─── POST /auth/mfa/setup ─────────────────────────────────────────────────────
// Generates a new TOTP secret and returns a QR code data URL.
// The secret is stored as mfaSecretPending until the user verifies it.
// Calling setup again before verify replaces the pending secret.
router.post('/auth/mfa/setup', requireAuth, async (req, res) => {
  try {
    const userId = req.authUser._id;
    const user   = await User.findById(userId, 'username email mfaEnabled').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.mfaEnabled) {
      return res.status(409).json({
        message: 'MFA is already enabled. Disable it first before setting up again.',
        code:    'MFA_ALREADY_ENABLED',
      });
    }

    // Generate a new TOTP secret
    const secret  = authenticator.generateSecret(20); // 160-bit entropy
    const label   = encodeURIComponent(user.email || user.username);
    const issuer  = encodeURIComponent(APP_NAME);
    const otpauth = authenticator.keyuri(label, issuer, secret);

    // Store as pending — not active until verify confirms it
    await User.findByIdAndUpdate(userId, { $set: { mfaSecretPending: secret } });

    // Generate QR code as data URL for the frontend to display
    const qrDataUrl = await QRCode.toDataURL(otpauth, { width: 256, margin: 2 });

    res.json({
      message:   'Scan the QR code with your authenticator app, then call /auth/mfa/verify',
      qrDataUrl,
      // Also return the raw secret for manual entry in authenticator apps
      secret,
      otpauth,
    });
  } catch (err) {
    console.error('[mfa/setup] ❌', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /auth/mfa/verify ────────────────────────────────────────────────────
// Confirms the TOTP setup by verifying the first OTP from the authenticator app.
// On success: mfaEnabled = true, mfaSecret = pending, mfaSecretPending cleared.
router.post('/auth/mfa/verify', requireAuth, mfaLimiter, async (req, res) => {
  const meta = getMeta(req);
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: 'otp is required' });

    const userId = req.authUser._id;
    // Explicitly select the secret fields (select: false by default)
    const user = await User.findById(userId, 'username mfaEnabled mfaSecretPending').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.mfaEnabled) {
      return res.status(409).json({ message: 'MFA is already enabled.', code: 'MFA_ALREADY_ENABLED' });
    }

    if (!user.mfaSecretPending) {
      return res.status(400).json({
        message: 'No pending MFA setup found. Call /auth/mfa/setup first.',
        code:    'NO_PENDING_SETUP',
      });
    }

    // Verify the OTP against the pending secret
    // window: 1 allows ±1 step (30s tolerance for clock skew)
    const valid = authenticator.verify({ token: String(otp).trim(), secret: user.mfaSecretPending });
    if (!valid) {
      await audit('MFA_VERIFY_FAILED', { userId, username: user.username, success: false, ...meta });
      captureAuthFailure({ action: 'MFA_VERIFY_FAILED', username: user.username, ip: meta.ip });
      return res.status(400).json({ message: 'Invalid OTP. Check your authenticator app and try again.', code: 'INVALID_OTP' });
    }

    // Activate MFA — move pending secret to active, clear pending
    await User.findByIdAndUpdate(userId, {
      $set:   { mfaEnabled: true, mfaSecret: user.mfaSecretPending },
      $unset: { mfaSecretPending: '' },
    });

    await audit('MFA_ENABLED', { userId, username: user.username, ...meta });
    console.log(`[mfa] ✅ MFA enabled for "${user.username}"`);

    res.json({ message: 'MFA enabled successfully. Future logins will require an OTP.' });
  } catch (err) {
    console.error('[mfa/verify] ❌', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /auth/mfa/challenge ─────────────────────────────────────────────────
// Step 2 of the MFA login flow.
// Accepts the short-lived challenge token (from POST /login) + OTP.
// On success: issues real access + refresh tokens.
// This endpoint does NOT require requireAuth — the challenge token IS the auth.
router.post('/auth/mfa/challenge', mfaLimiter, async (req, res) => {
  const meta = getMeta(req);
  try {
    const { challengeToken, otp } = req.body;
    if (!challengeToken) return res.status(400).json({ message: 'challengeToken is required' });
    if (!otp)            return res.status(400).json({ message: 'otp is required' });

    // Verify the challenge token
    let decoded;
    try {
      decoded = jwt.verify(challengeToken, JWT_SECRET());
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'MFA challenge expired. Please log in again.', code: 'CHALLENGE_EXPIRED' });
      }
      return res.status(401).json({ message: 'Invalid challenge token.', code: 'INVALID_CHALLENGE' });
    }

    if (decoded.challenge !== 'mfa') {
      return res.status(401).json({ message: 'Invalid challenge token.', code: 'INVALID_CHALLENGE' });
    }

    const userId = decoded.userId;
    // Explicitly select mfaSecret (select: false)
    const user = await User.findById(userId, '+mfaSecret').lean();
    if (!user || user.isDeleted) {
      return res.status(401).json({ message: 'User not found.' });
    }
    if (!user.mfaEnabled || !user.mfaSecret) {
      return res.status(400).json({ message: 'MFA is not enabled for this account.', code: 'MFA_NOT_ENABLED' });
    }

    // Verify OTP
    const valid = authenticator.verify({ token: String(otp).trim(), secret: user.mfaSecret });
    if (!valid) {
      await audit('MFA_CHALLENGE_FAILED', { userId, username: user.username, success: false, ...meta });
      captureAuthFailure({ action: 'MFA_CHALLENGE_FAILED', username: user.username, ip: meta.ip, tenantId: user.tenantId });
      return res.status(401).json({ message: 'Invalid OTP.', code: 'INVALID_OTP' });
    }

    // OTP valid — issue real tokens
    const role = normaliseRole(user.role);

    // Build session
    req.session.user = {
      _id:          user._id,
      username:     user.username,
      role,
      tenantId:     user.tenantId     || null,
      isGoogleUser: user.isGoogleUser || false,
    };

    const accessToken  = signAccessToken({ ...user, role });
    const refreshToken = await issueRefreshToken(user._id, meta);

    await audit('MFA_LOGIN_SUCCESS', { userId, username: user.username, ...meta });
    console.log(`[mfa] ✅ MFA challenge passed for "${user.username}"`);

    res.json({
      message:     'MFA verified. Login successful.',
      accessToken,
      refreshToken,
      expiresIn:   ACCESS_TOKEN_TTL,
      username:    user.username,
      role,
      tenantId:    user.tenantId || null,
      token:       accessToken, // legacy alias
    });
  } catch (err) {
    console.error('[mfa/challenge] ❌', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /auth/mfa/disable ───────────────────────────────────────────────────
// Disables MFA. Requires the current OTP to prevent accidental/malicious disable.
router.post('/auth/mfa/disable', requireAuth, mfaLimiter, async (req, res) => {
  const meta = getMeta(req);
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: 'otp is required to disable MFA' });

    const userId = req.authUser._id;
    // Explicitly select mfaSecret
    const user = await User.findById(userId, '+mfaSecret').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.mfaEnabled) {
      return res.status(400).json({ message: 'MFA is not enabled.', code: 'MFA_NOT_ENABLED' });
    }

    // Require valid OTP to disable — prevents an attacker with a stolen session from disabling MFA
    const valid = authenticator.verify({ token: String(otp).trim(), secret: user.mfaSecret });
    if (!valid) {
      await audit('MFA_DISABLE_FAILED', { userId, username: user.username, success: false, ...meta });
      captureAuthFailure({ action: 'MFA_DISABLE_FAILED', username: user.username, ip: meta.ip });
      return res.status(401).json({ message: 'Invalid OTP. MFA not disabled.', code: 'INVALID_OTP' });
    }

    // Disable MFA — clear both secret fields and revoke all sessions
    await User.findByIdAndUpdate(userId, {
      $set:   { mfaEnabled: false },
      $unset: { mfaSecret: '', mfaSecretPending: '' },
      $inc:   { tokenVersion: 1 }, // invalidate all existing JWTs
    });

    // Revoke all refresh tokens — forces re-login on all devices
    await RefreshToken.deleteMany({ userId });

    await audit('MFA_DISABLED', { userId, username: user.username, ...meta });
    console.log(`[mfa] ✅ MFA disabled for "${user.username}"`);

    res.json({ message: 'MFA disabled. All sessions have been revoked. Please log in again.' });
  } catch (err) {
    console.error('[mfa/disable] ❌', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /auth/mfa/status ─────────────────────────────────────────────────────
// Returns whether MFA is enabled for the current user.
router.get('/auth/mfa/status', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.authUser._id, 'mfaEnabled').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ mfaEnabled: user.mfaEnabled || false });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Export helpers needed by mfa/challenge
module.exports = router;
