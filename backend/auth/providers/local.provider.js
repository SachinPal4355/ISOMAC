/**
 * local.provider.js — Username/password authentication
 *
 * This is the default auth provider. It validates credentials against
 * the local MongoDB users collection with bcrypt password comparison.
 *
 * Implements the AuthProvider interface:
 *   authenticate(credentials) → { user } | null
 *   findOrCreateUser(profile) → User document
 */

const bcrypt = require('bcrypt');
const User   = require('../../models/User');
const { normaliseRole } = require('../../middleware/auth');

const MAX_ATTEMPTS     = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

/**
 * Authenticate with username + password.
 *
 * @param {{ username: string, password: string }} credentials
 * @returns {{ user: UserDoc, token: null } | null}
 *   Returns null if credentials are invalid.
 *   Throws { code: 'LOCKED', remainingMin } if account is locked.
 */
async function authenticate({ username, password }) {
  const user = await User.findOne({ username, isDeleted: { $ne: true } });

  // Lockout check
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const remainingMin = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    const err = new Error('Account locked');
    err.code = 'LOCKED';
    err.remainingMin = remainingMin;
    throw err;
  }

  const valid = user && await bcrypt.compare(password, user.password);

  if (!valid) {
    if (user) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const update   = { failedLoginAttempts: attempts };
      if (attempts >= MAX_ATTEMPTS) {
        update.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
      }
      await User.findByIdAndUpdate(user._id, { $set: update });
    }
    return null;
  }

  // Reset on success
  const role = normaliseRole(user.role);
  await User.findByIdAndUpdate(user._id, {
    $set: { role, failedLoginAttempts: 0, lockedUntil: null },
  });

  return { user: { _id: user._id, username: user.username, role } };
}

/**
 * Find or create a user from a normalised SSO profile.
 * Not used by local provider — included for interface consistency.
 */
async function findOrCreateUser(profile) {
  throw new Error('findOrCreateUser is not supported by the local provider');
}

module.exports = { name: 'local', authenticate, findOrCreateUser };
