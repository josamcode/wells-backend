const { PERMISSIONS } = require('./constants');

// Check if user has permission
const hasPermission = (userRole, requiredPermission) => {
  const rolePermissions = PERMISSIONS[userRole] || [];
  return rolePermissions.includes('manage_all') || rolePermissions.includes(requiredPermission);
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

