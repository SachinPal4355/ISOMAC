/**
 * audit.js — Action audit middleware
 *
 * FIXES applied in Phase 6:
 *   1. performedBy now reads from req.authUser (covers JWT requests — was broken before)
 *   2. performedById added for precise user attribution
 *   3. tenantId stamped on every audit log — fixes cross-tenant data leak
 */
const AuditLog = require('../models/AuditLog');

function auditLog(action, entity) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          await AuditLog.create({
            action,
            entity,
            entityId:      req.params?.id || req.params?.serialno || body?._id || '',
            // Fix: read from authUser first (covers JWT), fall back to session
            performedBy:   req.authUser?.username || req.session?.user?.username || 'system',
            performedById: req.authUser?._id      || req.session?.user?._id      || null,
            details:       { body: req.body },
            ip:            req.ip || '',
            // Fix: stamp tenantId — was missing, caused cross-tenant audit leak
            tenantId:      req.authUser?.tenantId || req.tenantId || null,
          });
        } catch (e) {
          console.error('[AuditLog] Failed to write:', e.message);
        }
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { auditLog };
