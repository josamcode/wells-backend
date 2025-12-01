const { verifyToken } = require('../config/jwt');
const User = require('../models/User');
const { errorResponse } = require('../utils/helpers');

// Verify JWT token and attach user to request
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return errorResponse(res, 401, 'Authentication required');
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      return errorResponse(res, 401, 'Invalid or expired token');
    }

    // Find user
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return errorResponse(res, 401, 'User not found');
    }

    // Check if user is active
    if (!user.isActive) {
      return errorResponse(res, 403, 'Account is deactivated');
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    return errorResponse(res, 401, 'Authentication failed', error.message);
  }
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        const user = await User.findById(decoded.id).select('-password');
        if (user && user.isActive) {
          req.user = user;
        }
      }
    }
    next();
  } catch (error) {
    next();
  }
};

module.exports = { authenticate, optionalAuth };

