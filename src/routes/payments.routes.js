const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const paymentsController = require('../controllers/payments.controller');
const { authenticate } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validation');
const { logAudit } = require('../middlewares/auditLog');

// Create payment request (Admin only)
router.post(
  '/',
  authenticate,
  authorize('manage_projects'),
  [
    body('projectId').notEmpty().withMessage('Project ID is required'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('recipientId').notEmpty().withMessage('Recipient ID is required'),
    body('recipientType').isIn(['contractor', 'project_manager']).withMessage('Invalid recipient type'),
    body('description').optional().trim(),
    validate,
  ],
  logAudit('create_payment', 'payment'),
  paymentsController.createPayment
);

// Get payments for a project
router.get(
  '/project/:projectId',
  authenticate,
  authorize('view_projects', 'view_assigned_projects', 'view_own_projects'),
  paymentsController.getProjectPayments
);

// Get payment summary for a project
router.get(
  '/project/:projectId/summary',
  authenticate,
  authorize('view_projects', 'view_assigned_projects', 'view_own_projects'),
  paymentsController.getPaymentSummary
);

// Get pending payments for current user
router.get(
  '/pending',
  authenticate,
  paymentsController.getPendingPayments
);

// Approve payment (Recipient only)
router.post(
  '/:paymentId/approve',
  authenticate,
  logAudit('approve_payment', 'payment'),
  paymentsController.approvePayment
);

// Reject payment (Recipient only)
router.post(
  '/:paymentId/reject',
  authenticate,
  [
    body('rejectionReason').optional().trim(),
    validate,
  ],
  logAudit('reject_payment', 'payment'),
  paymentsController.rejectPayment
);

module.exports = router;
