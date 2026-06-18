/**
 * auth.helpers.js — Shared auth utilities
 *
 * Extracted from auth.routes.js so they can be imported by mfa.routes.js
 * without creating a circular dependency.
 */
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const RefreshToken = require('../models/RefreshToken');

const ACCESS_TOKEN_TTL   = 15 * 60;  // 15 min
const REFRESH_TOKEN_DAYS = 7;

function permissionsForRole(role) {
  switch (role) {
    case 'super_admin':   return { canCreate: true,  canDelete: true,  canManageUsers: true,  canManageOrgs: true  };
    case 'company_admin': return { canCreate: true,  canDelete: true,  canManageUsers: true,  canManageOrgs: false };
    case 'admin':         return { canCreate: true,  canDelete: true,  canManageUsers: true,  canManageOrgs: false };
    case 'editor':        return { canCreate: true,  canDelete: false, canManageUsers: false, canManageOrgs: false };
    case 'employee':      return { canCreate: false, canDelete: false, canManageUsers: false, canManageOrgs: false };
    default:              return { canCreate: false, canDelete: false, canManageUsers: false, canManageOrgs: false };
  }
}

function signAccessToken(user) {
  const secret = process.env.JWT_SECRET || 'dev-only-jwt-secret-not-for-production';
  return jwt.sign(
    {
      userId:         String(user._id),
      username:       user.username,
      role:           user.role,
      permissions:    permissionsForRole(user.role),
      tenantId:       user.tenantId       ? String(user.tenantId)       : null,
      organizationId: user.organizationId ? String(user.organizationId) : null,
      tokenVersion:   user.tokenVersion ?? 0,
      jti:            uuidv4(),
    },
    secret,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

async function issueRefreshToken(userId, meta = {}) {
  const plaintext      = crypto.randomBytes(48).toString('hex');
  const tokenHash      = RefreshToken.hash(plaintext);
  const absoluteExpiry = new Date(Date.now() + REFRESH_TOKEN_DAYS * 86400000);

  await RefreshToken.create({
    userId,
    tokenHash,
    deviceId:       meta.deviceId  || '',
    userAgent:      meta.userAgent || '',
    ipAddress:      meta.ipAddress || '',
    absoluteExpiry,
  });

  return plaintext;
}

module.exports = { signAccessToken, issueRefreshToken, permissionsForRole, ACCESS_TOKEN_TTL };
