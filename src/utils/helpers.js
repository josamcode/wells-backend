const { PERMISSIONS } = require('./constants');

// Check if user has permission
const hasPermission = (userRole, requiredPermission) => {
  const rolePermissions = PERMISSIONS[userRole] || [];

  // Super admin with manage_all has all permissions
  if (rolePermissions.includes('manage_all')) {
    return true;
  }

  // Check exact permission match
  if (rolePermissions.includes(requiredPermission)) {
    return true;
  }

  // Check if manage permission includes the required permission
  // manage_projects includes: view_projects, create_project, edit_project
  if (requiredPermission.startsWith('view_projects') ||
    requiredPermission === 'create_project' ||
    requiredPermission === 'edit_project') {
    if (rolePermissions.includes('manage_projects')) {
      return true;
    }
  }

  // manage_reports includes: view_reports, submit_reports, edit_own_reports, review_reports, approve_reports
  if (requiredPermission.startsWith('view_reports') ||
    requiredPermission === 'submit_reports' ||
    requiredPermission === 'edit_own_reports' ||
    requiredPermission === 'review_reports' ||
    requiredPermission === 'approve_reports') {
    if (rolePermissions.includes('manage_reports')) {
      return true;
    }
  }

  return false;
};

// Format error response
const errorResponse = (res, statusCode, message, errors = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};

// Format success response
const successResponse = (res, statusCode, message, data = null) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

// Sanitize user data (remove password)
const sanitizeUser = (user) => {
  const userObj = user.toObject ? user.toObject() : user;
  const { password, ...sanitized } = userObj;
  return sanitized;
};

// Pagination helper
const paginate = (page = 1, limit = 10) => {
  const skip = (parseInt(page) - 1) * parseInt(limit);
  return { skip, limit: parseInt(limit) };
};

// Generate random password
const generatePassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

module.exports = {
  hasPermission,
  errorResponse,
  successResponse,
  sanitizeUser,
  paginate,
  generatePassword,
};

