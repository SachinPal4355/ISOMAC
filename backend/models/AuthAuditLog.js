/**
 * AuthAuditLog.js — Immutable audit trail for all authentication events.
 *
 * Separate from the general AuditLog to allow different retention policies
 * and to avoid polluting the asset/employee audit trail.
 *
 * Actions tracked:
 *   LOGIN_SUCCESS, LOGIN_FAILURE, LOGIN_LOCKED
 *   TOKEN_REFRESH, TOKEN_REUSE_DETECTED
 *   LOGOUT, LOGOUT_ALL
 *   PASSWORD_CHANGE
 *   ACCOUNT_LOCKED, ACCOUNT_UNLOCKED
 *   ROLE_CHANGED
 */
const mongoose = require('mongoose');

const authAuditSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  username: { type: String, default: '' },
  action:   { type: String, required: true },
  success:  { type: Boolean, default: true },
  metadata: {
    ip:        { type: String, default: '' },
    userAgent: { type: String, default: '' },
    deviceId:  { type: String, default: '' },
    detail:    { type: String, default: '' },
  },
}, { timestamps: true });

authAuditSchema.index({ userId: 1, createdAt: -1 });
authAuditSchema.index({ action: 1, createdAt: -1 });
authAuditSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuthAuditLog', authAuditSchema);
