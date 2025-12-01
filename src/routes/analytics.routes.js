const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { authenticate } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');

// Get dashboard analytics
router.get(
  '/dashboard',
  authenticate,
  authorize('view_analytics'),
  analyticsController.getDashboardAnalytics
);

// Export data
router.get(
  '/export',
  authenticate,
  authorize('export_data'),
  analyticsController.exportData
);

module.exports = router;

