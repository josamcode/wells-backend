const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const reportsController = require('../controllers/reports.controller');
const { authenticate } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validation');
const { logAudit } = require('../middlewares/auditLog');
const { upload, handleUploadError } = require('../middlewares/upload');

// Get all reports
router.get(
  '/',
  authenticate,
  authorize('view_reports', 'view_own_reports', 'view_projects'),
  reportsController.getReports
);

// Get report statistics
router.get(
  '/stats',
  authenticate,
  authorize('view_analytics'),
  reportsController.getReportStats
);

// Get single report
router.get(
  '/:id',
  authenticate,
  authorize('view_reports', 'view_own_reports'),
  reportsController.getReport
);

// Create report
router.post(
  '/',
  authenticate,
  authorize('submit_reports', 'manage_reports'),
  [
    body('project').notEmpty().withMessage('Project is required'),
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('workDate').isISO8601().withMessage('Work date is required'),
    body('reportType').optional().isIn(['daily', 'weekly', 'monthly', 'milestone', 'final']),
    validate,
  ],
  logAudit('create_report', 'report'),
  reportsController.createReport
);

// Update report
router.put(
  '/:id',
  authenticate,
  authorize('edit_own_reports', 'manage_reports'),
  [
    body('title').optional().trim().notEmpty(),
    body('workDate').optional().isISO8601(),
    body('reportType').optional().isIn(['daily', 'weekly', 'monthly', 'milestone', 'final']),
    validate,
  ],
  logAudit('update_report', 'report'),
  reportsController.updateReport
);

// Delete report
router.delete(
  '/:id',
  authenticate,
  authorize('edit_own_reports', 'manage_reports'),
  logAudit('delete_report', 'report'),
  reportsController.deleteReport
);

// Submit report for review
router.post(
  '/:id/submit',
  authenticate,
  authorize('submit_reports'),
  logAudit('submit_report', 'report'),
  reportsController.submitReport
);

// Review report (approve/reject)
router.post(
  '/:id/review',
  authenticate,
  authorize('review_reports', 'approve_reports', 'manage_reports'),
  [
    body('action').isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
    body('reviewNotes').optional().trim(),
    body('rejectionReason').if(body('action').equals('reject')).trim().notEmpty(),
    validate,
  ],
  logAudit('review_report', 'report'),
  reportsController.reviewReport
);

// Upload attachments
router.post(
  '/:id/attachments',
  authenticate,
  authorize('submit_reports', 'manage_reports'),
  upload.array('files', 10),
  handleUploadError,
  reportsController.uploadAttachments
);

// Delete attachment
router.delete(
  '/:reportId/attachments/:attachmentId',
  authenticate,
  authorize('edit_own_reports', 'manage_reports'),
  reportsController.deleteAttachment
);

module.exports = router;

