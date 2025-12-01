const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');
const { authenticate } = require('../middlewares/auth');

// Get notifications
router.get('/', authenticate, notificationsController.getNotifications);

// Get unread count
router.get('/unread-count', authenticate, notificationsController.getUnreadCount);

// Mark notification as read
router.patch('/:id/read', authenticate, notificationsController.markAsRead);

// Mark all as read
router.patch('/mark-all-read', authenticate, notificationsController.markAllAsRead);

// Delete notification
router.delete('/:id', authenticate, notificationsController.deleteNotification);

module.exports = router;

