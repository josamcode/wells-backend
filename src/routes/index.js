const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const projectsRoutes = require('./projects.routes');
const reportsRoutes = require('./reports.routes');
const notificationsRoutes = require('./notifications.routes');
const analyticsRoutes = require('./analytics.routes');
const settingsRoutes = require('./settings.routes');
const messagesRoutes = require('./messages.routes');
const paymentsRoutes = require('./payments.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/projects', projectsRoutes);
router.use('/reports', reportsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/settings', settingsRoutes);
router.use('/messages', messagesRoutes);
router.use('/payments', paymentsRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;

