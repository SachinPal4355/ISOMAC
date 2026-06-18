/**
 * sanitize.js — XSS input sanitization middleware
 *
 * Recursively strips HTML tags and dangerous attributes from all string
 * values in req.body before they reach any route handler.
 *
 * Uses the `xss` library which implements a whitelist-based HTML sanitizer.
 * With an empty whitelist ({}) it strips ALL tags — appropriate for an API
 * that never intentionally stores HTML.
 */
const xss = require('xss');

// Zero-tag whitelist: strips every HTML tag and attribute
const xssOptions = {
  whiteList: {},          // no tags allowed
  stripIgnoreTag: true,   // strip disallowed tags entirely (not just attributes)
  stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed'],
};

/**
 * Recursively sanitize all string values in an object/array.
 * Numbers, booleans, dates, ObjectIds are left untouched.
 */
function sanitizeValue(val) {
  if (typeof val === 'string') return xss(val.trim(), xssOptions);
  if (Array.isArray(val))      return val.map(sanitizeValue);
  if (val !== null && typeof val === 'object') return sanitizeObject(val);
  return val;
}

function sanitizeObject(obj) {
  const clean = {};
  for (const key of Object.keys(obj)) {
    clean[key] = sanitizeValue(obj[key]);
  }
  return clean;
}

/**
 * Express middleware — sanitizes req.body in-place.
 * Apply globally in server.js after express.json(), before routes.
 */
function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

module.exports = { sanitizeBody, sanitizeValue, sanitizeObject };
