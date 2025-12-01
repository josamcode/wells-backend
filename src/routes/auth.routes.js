const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validation');

// Login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate,
  ],
  authController.login
);

// Get current user profile
router.get('/profile', authenticate, authController.getProfile);

// Update profile
router.put(
  '/profile',
  authenticate,
  [
    body('fullName').optional().trim().notEmpty(),
    body('phone').optional().trim(),
    body('organization').optional().trim(),
    body('language').optional().isIn(['en', 'ar']),
    validate,
  ],
  authController.updateProfile
);

// Change password
router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    validate,
  ],
  authController.changePassword
);

// Forgot password
router.post(
  '/forgot-password',
  [body('email').isEmail().withMessage('Valid email is required'), validate],
  authController.forgotPassword
);

// Reset password
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Token is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate,
  ],
  authController.resetPassword
);

module.exports = router;

