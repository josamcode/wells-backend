const notificationService = require('../services/notification.service');
const { successResponse, errorResponse } = require('../utils/helpers');

// Get user notifications
exports.getNotifications = async (req, res) => {
  try {
    // Clients don't have User records, so they can't have notifications
    if (req.user.isClient) {
      return successResponse(res, 200, 'Notifications retrieved successfully', {
        notifications: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    }

    const { page = 1, limit = 20, unreadOnly = 'false' } = req.query;

    const result = await notificationService.getUserNotifications(
      req.user._id,
      parseInt(page),
      parseInt(limit),
      unreadOnly === 'true'
    );

    return successResponse(res, 200, 'Notifications retrieved successfully', result);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    // Clients don't have User records, so they can't have notifications
    if (req.user.isClient) {
      return successResponse(res, 200, 'Unread count retrieved successfully', { count: 0 });
    }

    const count = await notificationService.getUnreadCount(req.user._id);

    return successResponse(res, 200, 'Unread count retrieved successfully', { count });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.user._id);

    if (!notification) {
      return errorResponse(res, 404, 'Notification not found');
    }

    return successResponse(res, 200, 'Notification marked as read', notification);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Mark all as read
exports.markAllAsRead = async (req, res) => {
  try {
    await notificationService.markAllAsRead(req.user._id);

    return successResponse(res, 200, 'All notifications marked as read');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const success = await notificationService.delete(req.params.id, req.user._id);

    if (!success) {
      return errorResponse(res, 404, 'Notification not found');
    }

    return successResponse(res, 200, 'Notification deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

