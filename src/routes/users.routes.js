const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const usersController = require('../controllers/users.controller');
const { authenticate } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validation');
const { logAudit } = require('../middlewares/auditLog');

// Get all users
router.get(
  '/',
  authenticate,
  authorize('manage_users'),
  usersController.getUsers
);

// Get user statistics
router.get(
  '/stats',
  authenticate,
  authorize('manage_users'),
  usersController.getUserStats
);

// Get users by role (for dropdowns)
router.get(
  '/role/:role',
  authenticate,
  usersController.getUsersByRole
);

// Get single user
router.get(
  '/:id',
  authenticate,
  authorize('manage_users'),
  usersController.getUser
);

// Create user
router.post(
  '/',
  authenticate,
  authorize('manage_users'),
  [
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('role').optional().isIn(['super_admin', 'admin', 'project_manager', 'contractor', 'viewer']),
    body('phone').optional().trim(),
    body('organization').optional().trim(),
    body('country').optional().trim(),
    validate,
  ],
  logAudit('create_user', 'user'),
  usersController.createUser
);

// Update user
router.put(
  '/:id',
  authenticate,
  authorize('manage_users'),
  [
    body('fullName').optional().trim().notEmpty(),
    body('role').optional().isIn(['super_admin', 'admin', 'project_manager', 'contractor', 'viewer']),
    body('phone').optional().trim(),
    body('organization').optional().trim(),
    body('country').optional().trim(),
    body('isActive').optional().isBoolean(),
    validate,
  ],
  logAudit('update_user', 'user'),
  usersController.updateUser
);

// Delete user
router.delete(
  '/:id',
  authenticate,
  authorize('manage_users'),
  logAudit('delete_user', 'user'),
  usersController.deleteUser
);

// Toggle user status
router.patch(
  '/:id/toggle-status',
  authenticate,
  authorize('manage_users'),
  logAudit('toggle_user_status', 'user'),
  usersController.toggleUserStatus
);

module.exports = router;

