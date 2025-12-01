const AuditLog = require('../models/AuditLog');

// Middleware to log critical actions
const logAudit = (action, entityType) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json;

    // Override json method to capture response
    res.json = function (data) {
      // Log only on successful operations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        // Extract entity ID from params or body
        const entityId = req.params.id || req.params.projectId || req.params.reportId || data?.data?._id;

        // Create audit log (don't wait for it)
        AuditLog.create({
          user: req.user._id,
          action,
          entityType,
          entityId,
          changes: {
            method: req.method,
            body: req.body,
            params: req.params,
          },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          success: true,
        }).catch((err) => console.error('Audit log error:', err));
      }

      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  };
};

module.exports = { logAudit };

