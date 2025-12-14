const { validationResult } = require('express-validator');
const { errorResponse } = require('../utils/helpers');

// Handle validation errors from express-validator
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Create a detailed error message from all validation errors
    const errorMessages = errors.array().map(err => err.msg).join(', ');
    return errorResponse(res, 400, errorMessages || 'Validation failed', errors.array());
  }
  next();
};

module.exports = { validate };

