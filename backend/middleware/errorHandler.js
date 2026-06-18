/**
 * errorHandler.js — Global Express error handler
 *
 * Must be registered LAST in the middleware chain, after sentryErrorHandler().
 * Sentry captures 5xx errors before this handler formats the response.
 */
const { captureException } = require('../lib/sentry');

function errorHandler(err, req, res, _next) {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const isProd  = process.env.NODE_ENV === 'production';

  // Manually capture 5xx errors that weren't already caught by sentryErrorHandler
  // (e.g. errors thrown inside async middleware before Sentry's handler runs)
  if (status >= 500) {
    captureException(err, {
      action:   `${req.method} ${req.path}`,
      tenantId: req.authUser?.tenantId,
      userId:   req.authUser?._id,
      status,
    });
  }

  // Structured log — pino-compatible JSON in production, readable in dev
  const logger = (() => { try { return require('../lib/logger'); } catch (_) { return console; } })();
  if (status >= 500) {
    logger.error({ err, method: req.method, path: req.path, status }, message);
  } else if (status >= 400) {
    logger.warn({ method: req.method, path: req.path, status }, message);
  }

  res.status(status).json({
    success: false,
    message,
    // Never expose stack traces in production
    ...(!isProd && { stack: err.stack }),
  });
}

module.exports = errorHandler;
