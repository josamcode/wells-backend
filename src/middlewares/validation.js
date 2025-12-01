const { validationResult } = require('express-validator');
const { errorResponse } = require('../utils/helpers');

// Handle validation errors from express-validator
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return errorResponse(res, 400, 'Validation failed', errors.array());
  }
  next();
};

module.exports = { validate };

