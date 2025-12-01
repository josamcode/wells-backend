const Notification = require('../models/Notification');
const { NOTIFICATION_TYPES } = require('../utils/constants');

class NotificationService {
  // Create a notification
  async create(data) {
    try {
      const notification = await Notification.create(data);
      return notification;
    } catch (error) {
      console.error('Create notification error:', error);
      return null;
    }
  }

  // Create multiple notifications
  async createMany(notificationsData) {
    try {
      const notifications = await Notification.insertMany(notificationsData);
      return notifications;
    } catch (error) {
      console.error('Create many notifications error:', error);
      return [];
    }
  }

  // Get user notifications
  async getUserNotifications(userId, page = 1, limit = 20, unreadOnly = false) {
    try {
      const mongoose = require('mongoose');

      // Convert userId to ObjectId if it's a string
      let recipientId = userId;
      if (typeof userId === 'string' && mongoose.Types.ObjectId.isValid(userId)) {
        recipientId = new mongoose.Types.ObjectId(userId);
      } else if (userId && userId.toString) {
        // If it's already an ObjectId, ensure it's properly formatted
        recipientId = new mongoose.Types.ObjectId(userId.toString());
      }

      const query = { recipient: recipientId };
      if (unreadOnly) {
        query.isRead = false;
      }

      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit);

      const total = await Notification.countDocuments(query);

      // Debug logging in development
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 Notification Query Debug:', {
          userId,
          userIdType: typeof userId,
          recipientId,
          recipientIdString: recipientId.toString(),
          query,
          total,
          found: notifications.length,
          sampleRecipient: notifications.length > 0 ? notifications[0].recipient.toString() : 'none',
        });
      }

      return {
        notifications,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Get user notifications error:', error);
      return { notifications: [], total: 0, page: 1, totalPages: 0 };
    }
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, recipient: userId },
        { isRead: true, readAt: new Date() },
        { new: true }
      );
      return notification;
    } catch (error) {
      console.error('Mark as read error:', error);
      return null;
    }
  }

  // Mark all as read
  async markAllAsRead(userId) {
    try {
      await Notification.updateMany(
        { recipient: userId, isRead: false },
        { isRead: true, readAt: new Date() }
      );
      return true;
    } catch (error) {
      console.error('Mark all as read error:', error);
      return false;
    }
  }

  // Get unread count
  async getUnreadCount(userId) {
    try {
      const count = await Notification.countDocuments({
        recipient: userId,
        isRead: false,
      });
      return count;
    } catch (error) {
      console.error('Get unread count error:', error);
      return 0;
    }
  }

  // Delete notification
  async delete(notificationId, userId) {
    try {
      await Notification.findOneAndDelete({
        _id: notificationId,
        recipient: userId,
      });
      return true;
    } catch (error) {
      console.error('Delete notification error:', error);
      return false;
    }
  }

  // Helper: Notify about project assignment
  async notifyProjectAssignment(projectId, contractorId, projectName) {
    return await this.create({
      recipient: contractorId,
      type: NOTIFICATION_TYPES.PROJECT_ASSIGNED,
      title: {
        en: 'New Project Assigned',
        ar: 'تم تعيين مشروع جديد',
      },
      message: {
        en: `You have been assigned to project: ${projectName}`,
        ar: `تم تعيينك لمشروع: ${projectName}`,
      },
      relatedEntity: {
        entityType: 'project',
        entityId: projectId,
      },
      actionUrl: `/projects/${projectId}`,
      priority: 'high',
    });
  }

  // Helper: Notify about report submission
  async notifyReportSubmission(reportId, projectManagerIds, reportTitle, projectName) {
    const notifications = projectManagerIds.map((pmId) => ({
      recipient: pmId,
      type: NOTIFICATION_TYPES.REPORT_SUBMITTED,
      title: {
        en: 'New Report Submitted',
        ar: 'تم تقديم تقرير جديد',
      },
      message: {
        en: `New report "${reportTitle}" submitted for ${projectName}`,
        ar: `تم تقديم تقرير جديد "${reportTitle}" لمشروع ${projectName}`,
      },
      relatedEntity: {
        entityType: 'report',
        entityId: reportId,
      },
      actionUrl: `/reports/${reportId}`,
      priority: 'high',
    }));

    return await this.createMany(notifications);
  }

  // Helper: Notify about report approval
  async notifyReportApproval(reportId, contractorId, reportTitle) {
    return await this.create({
      recipient: contractorId,
      type: NOTIFICATION_TYPES.REPORT_APPROVED,
      title: {
        en: 'Report Approved',
        ar: 'تمت الموافقة على التقرير',
      },
      message: {
        en: `Your report "${reportTitle}" has been approved`,
        ar: `تمت الموافقة على تقريرك "${reportTitle}"`,
      },
      relatedEntity: {
        entityType: 'report',
        entityId: reportId,
      },
      actionUrl: `/reports/${reportId}`,
      priority: 'medium',
    });
  }

  // Helper: Notify about report rejection
  async notifyReportRejection(reportId, contractorId, reportTitle, reason) {
    return await this.create({
      recipient: contractorId,
      type: NOTIFICATION_TYPES.REPORT_REJECTED,
      title: {
        en: 'Report Rejected',
        ar: 'تم رفض التقرير',
      },
      message: {
        en: `Your report "${reportTitle}" has been rejected. Reason: ${reason}`,
        ar: `تم رفض تقريرك "${reportTitle}". السبب: ${reason}`,
      },
      relatedEntity: {
        entityType: 'report',
        entityId: reportId,
      },
      actionUrl: `/reports/${reportId}`,
      priority: 'high',
    });
  }
}

// Export singleton instance
module.exports = new NotificationService();

