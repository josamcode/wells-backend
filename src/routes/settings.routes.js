const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const settingsController = require('../controllers/settings.controller');
const { authenticate, optionalAuth } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validation');
const { logAudit } = require('../middlewares/auditLog');

// Get all settings
router.get(
  '/',
  optionalAuth,
  settingsController.getSettings
);

// Get single setting
router.get(
  '/:key',
  optionalAuth,
  settingsController.getSetting
);

// Update setting
router.put(
  '/',
  authenticate,
  authorize('manage_settings'),
  [
    body('key').trim().notEmpty().withMessage('Key is required'),
    body('value').exists().withMessage('Value is required'),
    validate,
  ],
  logAudit('update_setting', 'settings'),
  settingsController.updateSetting
);

// Update multiple settings
router.post(
  '/bulk',
  authenticate,
  authorize('manage_settings'),
  [body('settings').isObject().withMessage('Settings object is required'), validate],
  logAudit('update_multiple_settings', 'settings'),
  settingsController.updateMultipleSettings
);

// Delete setting
router.delete(
  '/:key',
  authenticate,
  authorize('manage_settings'),
  logAudit('delete_setting', 'settings'),
  settingsController.deleteSetting
);

// Initialize Google Drive
router.post(
  '/google-drive/initialize',
  authenticate,
  authorize('manage_settings'),
  [
    body('type').isIn(['service_account', 'oauth']).withMessage('Type must be service_account or oauth'),
    body('credentials').isObject().withMessage('Credentials object is required'),
    validate,
  ],
  logAudit('initialize_google_drive', 'settings'),
  settingsController.initializeGoogleDrive
);

// Get Google Drive status
router.get(
  '/google-drive/status',
  authenticate,
  authorize('manage_settings'),
  settingsController.getGoogleDriveStatus
);

// Update theme
router.post(
  '/theme',
  authenticate,
  authorize('manage_settings'),
  [
    body('primaryColor').optional().trim(),
    body('secondaryColor').optional().trim(),
    body('mode').optional().isIn(['light', 'dark']),
    validate,
  ],
  logAudit('update_theme', 'settings'),
  settingsController.updateTheme
);

module.exports = router;

