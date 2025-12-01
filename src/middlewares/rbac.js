const { hasPermission } = require('../utils/helpers');
const { errorResponse } = require('../utils/helpers');
const { ROLES } = require('../utils/constants');

// Check if user has required permission
const authorize = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 401, 'Authentication required');
    }

    // Super Admin has all permissions
    if (req.user.role === ROLES.SUPER_ADMIN) {
      return next();
    }

    // Check if user has at least one of the required permissions
    const hasRequiredPermission = requiredPermissions.some((permission) =>
      hasPermission(req.user.role, permission)
    );

    if (!hasRequiredPermission) {
      return errorResponse(res, 403, 'Insufficient permissions');
    }

    next();
  };
};

// Check if user has specific role(s)
const hasRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 401, 'Authentication required');
    }

    if (!roles.includes(req.user.role)) {
      return errorResponse(res, 403, 'Insufficient permissions');
    }

    next();
  };
};

// Check if user is accessing their own resource or has permission
const isOwnerOrHasPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 401, 'Authentication required');
    }

    // Check if accessing own resource
    const resourceUserId = req.params.userId || req.params.id;
    if (resourceUserId === req.user._id.toString()) {
      return next();
    }

    // Check if has permission
    if (hasPermission(req.user.role, permission)) {
      return next();
    }

    return errorResponse(res, 403, 'Insufficient permissions');
  };
};

module.exports = { authorize, hasRole, isOwnerOrHasPermission };

