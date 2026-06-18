/**
 * RefreshToken.js — Persistent refresh token store
 *
 * One document per active device session.
 * tokenHash = SHA-256 of the plaintext token (never stored in plain).
 * absoluteExpiry = login time + 7 days — never extended on rotation.
 */
const mongoose = require('mongoose');
const crypto   = require('crypto');

const refreshTokenSchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash:       { type: String, required: true, unique: true },
  deviceId:        { type: String, default: '' },   // client-supplied fingerprint
  userAgent:       { type: String, default: '' },
  ipAddress:       { type: String, default: '' },
  absoluteExpiry:  { type: Date,   required: true }, // hard ceiling — never extended
  rotatedAt:       { type: Date,   default: null },  // set when this token is rotated out
}, { timestamps: true });

// TTL index — MongoDB auto-deletes expired documents
refreshTokenSchema.index({ absoluteExpiry: 1 }, { expireAfterSeconds: 0 });

/**
 * Hash a plaintext refresh token with SHA-256.
 * @param {string} token
 * @returns {string} hex digest
 */
refreshTokenSchema.statics.hash = function(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
};

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
