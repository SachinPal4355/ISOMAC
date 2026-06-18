/**
 * sentry.js — Production-grade Sentry configuration
 *
 * FEATURES:
 *   - Environment tagging (development / staging / production)
 *   - Release version tracking (from SENTRY_RELEASE or package.json)
 *   - Performance monitoring with per-environment sample rates
 *   - User context attached to every event (userId, username, tenantId, role)
 *   - PII scrubbing — strips passwords, tokens, secrets from payloads
 *   - Auth failure tracking via captureAuthFailure()
 *   - Structured breadcrumbs for request tracing
 *   - No-op when SENTRY_DSN is not set — safe to import in all environments
 *
 * INSTALL:
 *   npm install @sentry/node @sentry/profiling-node
 *
 * ENV VARS:
 *   SENTRY_DSN                  — required to activate (from Sentry project settings)
 *   SENTRY_ENVIRONMENT          — overrides NODE_ENV for Sentry tagging
 *   SENTRY_RELEASE              — release identifier (e.g. git SHA, semver)
 *   SENTRY_TRACES_SAMPLE_RATE   — 0.0–1.0, default: 0.1 prod / 1.0 dev
 *   SENTRY_PROFILES_SAMPLE_RATE — 0.0–1.0, default: 0.1 prod / 0.0 dev
 *
 * ALERT RULES (configure in Sentry UI → Alerts → Create Alert):
 *   1. High error rate:
 *      Condition: Number of errors > 10 in 5 minutes
 *      Action:    Email / Slack / PagerDuty
 *
 *   2. Auth failures:
 *      Condition: issue.title contains "AUTH_FAILURE" AND count > 20 in 5 minutes
 *      Action:    Email / Slack
 *
 *   3. Tenant errors:
 *      Condition: tag[tenant_id] is set AND level = error
 *      Action:    Email tenant admin
 *
 *   4. P95 latency:
 *      Condition: p95(transaction.duration) > 2000ms
 *      Action:    Slack
 */

'use strict';

let Sentry   = null;
let _enabled = false;

// ─── PII fields to scrub from request bodies ─────────────────────────────────
const SCRUB_KEYS = new Set([
  'password', 'currentPassword', 'newPassword', 'confirmPassword',
  'token', 'accessToken', 'refreshToken', 'secret', 'apiKey',
  'authorization', 'cookie', 'session',
  'creditCard', 'cardNumber', 'cvv', 'ssn',
]);

function scrubObject(obj, depth = 0) {
  if (depth > 5 || !obj || typeof obj !== 'object') return obj;
  const result = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    if (SCRUB_KEYS.has(key.toLowerCase())) {
      result[key] = '[Filtered]';
    } else {
      result[key] = scrubObject(obj[key], depth + 1);
    }
  }
  return result;
}

// ─── Resolve release identifier ───────────────────────────────────────────────
function resolveRelease() {
  if (process.env.SENTRY_RELEASE) return process.env.SENTRY_RELEASE;
  try {
    const pkg = require('../../package.json');
    return pkg.version ? `isomac@${pkg.version}` : undefined;
  } catch (_) {
    return undefined;
  }
}

// ─── Resolve per-environment sample rates ────────────────────────────────────
function resolveSampleRates(env) {
  const isProd = env === 'production';
  return {
    traces:   parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE   || (isProd ? '0.1'  : '1.0')),
    profiles: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || (isProd ? '0.1'  : '0.0')),
  };
}

// ─── initSentry ───────────────────────────────────────────────────────────────
// Call once at the very top of server.js, before any other middleware.
function initSentry(app) {
  if (!process.env.SENTRY_DSN) {
    console.log('[sentry] ℹ️  SENTRY_DSN not set — error tracking disabled');
    return;
  }

  try {
    Sentry = require('@sentry/node');

    const env     = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
    const release = resolveRelease();
    const rates   = resolveSampleRates(env);

    Sentry.init({
      dsn:         process.env.SENTRY_DSN,
      environment: env,
      release,

      // ── Performance monitoring ──────────────────────────────────────────────
      tracesSampleRate:   rates.traces,
      profilesSampleRate: rates.profiles,

      // ── Integrations ───────────────────────────────────────────────────────
      integrations: [
        // HTTP tracing — captures outbound HTTP calls as spans
        new Sentry.Integrations.Http({ tracing: true }),
        // Express tracing — captures route handler durations
        new Sentry.Integrations.Express({ app }),
        // MongoDB tracing — captures query durations
        new Sentry.Integrations.Mongo({ useMongoose: true }),
      ],

      // ── PII scrubbing ───────────────────────────────────────────────────────
      // Strip sensitive fields from request bodies before sending to Sentry.
      beforeSend(event) {
        // Scrub request body
        if (event.request?.data) {
          event.request.data = scrubObject(
            typeof event.request.data === 'string'
              ? (() => { try { return JSON.parse(event.request.data); } catch (_) { return {}; } })()
              : event.request.data
          );
        }
        // Strip cookie header entirely
        if (event.request?.headers?.cookie) {
          event.request.headers.cookie = '[Filtered]';
        }
        if (event.request?.headers?.authorization) {
          event.request.headers.authorization = '[Filtered]';
        }
        return event;
      },

      // ── Transaction filtering ───────────────────────────────────────────────
      // Drop health check transactions — they're noise in performance data.
      tracesSampler(samplingContext) {
        const name = samplingContext.transactionContext?.name || '';
        if (name.includes('/health')) return 0;
        return rates.traces;
      },

      // ── Ignored errors ──────────────────────────────────────────────────────
      // These are expected client errors — not bugs.
      ignoreErrors: [
        'TokenExpiredError',
        'JsonWebTokenError',
        'Not allowed by CORS',
        /^401/,
        /^403/,
        /^404/,
      ],
    });

    // ── Express middleware ──────────────────────────────────────────────────
    // requestHandler MUST be first middleware — captures request context.
    app.use(Sentry.Handlers.requestHandler({
      user:        ['id', 'username'],
      ip:          true,
      request:     ['method', 'url', 'query_string', 'headers'],
      transaction: 'methodPath',
    }));

    // tracingHandler enables performance monitoring spans.
    app.use(Sentry.Handlers.tracingHandler());

    _enabled = true;
    console.log(`[sentry] ✅ Active — env=${env} release=${release || 'unset'} traces=${rates.traces}`);
  } catch (e) {
    console.warn('[sentry] ⚠️  Failed to initialise:', e.message);
  }
}

// ─── sentryErrorHandler ───────────────────────────────────────────────────────
// Must be placed AFTER all routes, BEFORE your own errorHandler.
function sentryErrorHandler() {
  if (!Sentry) return (err, _req, _res, next) => next(err);
  return Sentry.Handlers.errorHandler({
    shouldHandleError(err) {
      // Only send 5xx errors to Sentry — 4xx are expected client errors
      const status = err.status || err.statusCode || 500;
      return status >= 500;
    },
  });
}

// ─── setUserContext ───────────────────────────────────────────────────────────
// Call after requireAuth to attach user identity to all subsequent events.
// Usage: app.use(requireAuth, setUserContext)
function setUserContext(req, _res, next) {
  if (!Sentry || !req.authUser) return next();
  Sentry.configureScope(scope => {
    scope.setUser({
      id:       String(req.authUser._id || ''),
      username: req.authUser.username   || '',
    });
    scope.setTag('tenant_id', String(req.authUser.tenantId || 'none'));
    scope.setTag('role',      req.authUser.role || 'unknown');
  });
  next();
}

// ─── captureException ────────────────────────────────────────────────────────
// Manually capture an error with optional structured context.
// Use in catch blocks where you want Sentry to record the error
// but you're handling it gracefully (not re-throwing).
function captureException(err, context = {}) {
  if (!Sentry) return;
  Sentry.withScope(scope => {
    if (context.userId)   scope.setUser({ id: String(context.userId) });
    if (context.tenantId) scope.setTag('tenant_id', String(context.tenantId));
    if (context.action)   scope.setTag('action', context.action);
    if (context.level)    scope.setLevel(context.level);
    Object.entries(context).forEach(([k, v]) => {
      if (!['userId', 'tenantId', 'action', 'level'].includes(k)) {
        scope.setExtra(k, v);
      }
    });
    Sentry.captureException(err);
  });
}

// ─── captureAuthFailure ───────────────────────────────────────────────────────
// Dedicated helper for auth failure events.
// These are captured as messages (not exceptions) so Sentry alert rules
// can target them specifically by title: "AUTH_FAILURE".
//
// Configure a Sentry alert:
//   Condition: issue.title = "AUTH_FAILURE" AND count > 20 in 5 minutes
//   Action:    Email / Slack / PagerDuty
function captureAuthFailure({ action, username, ip, detail, tenantId } = {}) {
  if (!Sentry) return;
  Sentry.withScope(scope => {
    scope.setLevel('warning');
    scope.setTag('auth_action', action || 'UNKNOWN');
    scope.setTag('ip',          ip     || 'unknown');
    if (tenantId) scope.setTag('tenant_id', String(tenantId));
    scope.setExtra('username', username || '');
    scope.setExtra('detail',   detail   || '');
    // Title "AUTH_FAILURE" is what Sentry alert rules match against
    Sentry.captureMessage('AUTH_FAILURE', 'warning');
  });
}

// ─── addBreadcrumb ────────────────────────────────────────────────────────────
// Add a structured breadcrumb to the current Sentry scope.
// Breadcrumbs appear in the event timeline — useful for tracing what
// happened before an error.
function addBreadcrumb({ message, category = 'app', level = 'info', data = {} } = {}) {
  if (!Sentry) return;
  Sentry.addBreadcrumb({ message, category, level, data, timestamp: Date.now() / 1000 });
}

// ─── isEnabled ────────────────────────────────────────────────────────────────
function isEnabled() { return _enabled; }

module.exports = {
  initSentry,
  sentryErrorHandler,
  setUserContext,
  captureException,
  captureAuthFailure,
  addBreadcrumb,
  isEnabled,
};
