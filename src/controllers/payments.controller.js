const Payment = require('../models/Payment');
const Project = require('../models/Project');
const { successResponse, errorResponse } = require('../utils/helpers');
const { ROLES } = require('../utils/constants');
const notificationService = require('../services/notification.service');

// Create payment request (Admin only)
exports.createPayment = async (req, res) => {
  try {
    const { projectId, amount, currency, recipientId, recipientType, description } = req.body;

    // Validate project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    // Validate recipient
    if (!recipientId || !recipientType) {
      return errorResponse(res, 400, 'Recipient and recipient type are required');
    }

    // Validate recipient type matches project
    if (recipientType === 'contractor' && project.contractor?.toString() !== recipientId) {
      return errorResponse(res, 400, 'Recipient is not the project contractor');
    }
    if (recipientType === 'project_manager' && project.projectManager?.toString() !== recipientId) {
      return errorResponse(res, 400, 'Recipient is not the project manager');
    }

    const payment = new Payment({
      project: projectId,
      amount,
      currency: currency || 'USD',
      recipient: recipientId,
      recipientType,
      description: description?.trim() || '',
      requestedBy: req.user._id,
      status: 'pending',
    });

    await payment.save();

    const populatedPayment = await Payment.findById(payment._id)
      .populate('project', 'projectNumber projectName')
      .populate('recipient', 'fullName email')
      .populate('requestedBy', 'fullName email');

    // Notify recipient about the payment request
    await notificationService.notifyPaymentRequest(
      payment._id,
      recipientId,
      amount,
      currency || 'USD',
      project.projectName,
      project.projectNumber,
      projectId
    );

    return successResponse(res, 201, 'Payment request created successfully', populatedPayment);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get payments for a project
exports.getProjectPayments = async (req, res) => {
  try {
    const { projectId } = req.params;

    // Check if project exists and user has access
    const project = await Project.findById(projectId);
    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    // Check access based on role
    if (req.user.role === ROLES.CONTRACTOR && project.contractor?.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Access denied');
    }

    if (req.user.role === ROLES.PROJECT_MANAGER && project.projectManager?.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Access denied');
    }

    const payments = await Payment.find({ project: projectId })
      .populate('recipient', 'fullName email')
      .populate('requestedBy', 'fullName email')
      .sort({ createdAt: -1 });

    return successResponse(res, 200, 'Payments retrieved successfully', payments);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get payment summary for a project
exports.getPaymentSummary = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    // Check access based on role
    if (req.user.role === ROLES.CONTRACTOR && project.contractor?.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Access denied');
    }

    if (req.user.role === ROLES.PROJECT_MANAGER && project.projectManager?.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Access denied');
    }

    // Calculate totals
    const payments = await Payment.find({ project: projectId, status: 'approved' });
    const totalSpent = payments.reduce((sum, payment) => {
      // Convert to project currency if different
      if (payment.currency === project.budget?.currency) {
        return sum + payment.amount;
      }
      // For now, assume same currency (can add conversion later)
      return sum + payment.amount;
    }, 0);

    const budget = project.budget?.amount || 0;
    const remaining = budget - totalSpent;
    const spentPercentage = budget > 0 ? (totalSpent / budget) * 100 : 0;

    return successResponse(res, 200, 'Payment summary retrieved successfully', {
      budget,
      totalSpent,
      remaining,
      spentPercentage: Math.round(spentPercentage * 100) / 100,
      currency: project.budget?.currency || 'USD',
      paymentsCount: payments.length,
    });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Approve payment (Recipient only)
exports.approvePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findById(paymentId).populate('project');
    if (!payment) {
      return errorResponse(res, 404, 'Payment not found');
    }

    // Check if user is the recipient
    if (payment.recipient.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Only the recipient can approve this payment');
    }

    // Check if already processed
    if (payment.status !== 'pending') {
      return errorResponse(res, 400, `Payment has already been ${payment.status}`);
    }

    payment.status = 'approved';
    payment.approvedAt = new Date();
    await payment.save();

    const populatedPayment = await Payment.findById(payment._id)
      .populate('project', 'projectNumber projectName')
      .populate('recipient', 'fullName email')
      .populate('requestedBy', 'fullName email');

    // Notify requester about the payment approval
    await notificationService.notifyPaymentApproval(
      payment._id,
      payment.requestedBy,
      payment.amount,
      payment.currency,
      payment.project.projectName,
      payment.project.projectNumber,
      populatedPayment.recipient.fullName,
      payment.project._id
    );

    return successResponse(res, 200, 'Payment approved successfully', populatedPayment);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Reject payment (Recipient only)
exports.rejectPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { rejectionReason } = req.body;

    const payment = await Payment.findById(paymentId)
      .populate('project', 'projectNumber projectName')
      .populate('requestedBy', 'fullName email');
    if (!payment) {
      return errorResponse(res, 404, 'Payment not found');
    }

    // Check if user is the recipient
    if (payment.recipient.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Only the recipient can reject this payment');
    }

    // Check if already processed
    if (payment.status !== 'pending') {
      return errorResponse(res, 400, `Payment has already been ${payment.status}`);
    }

    payment.status = 'rejected';
    payment.rejectedAt = new Date();
    payment.rejectionReason = rejectionReason?.trim() || '';
    await payment.save();

    const populatedPayment = await Payment.findById(payment._id)
      .populate('project', 'projectNumber projectName')
      .populate('recipient', 'fullName email')
      .populate('requestedBy', 'fullName email');

    // Notify requester about the payment rejection
    await notificationService.notifyPaymentRejection(
      payment._id,
      payment.requestedBy,
      payment.amount,
      payment.currency,
      payment.project.projectName,
      payment.project.projectNumber,
      populatedPayment.recipient.fullName,
      rejectionReason?.trim() || '',
      payment.project._id
    );

    return successResponse(res, 200, 'Payment rejected successfully', populatedPayment);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get pending payments for current user (as recipient)
exports.getPendingPayments = async (req, res) => {
  try {
    const payments = await Payment.find({
      recipient: req.user._id,
      status: 'pending',
    })
      .populate('project', 'projectNumber projectName')
      .populate('requestedBy', 'fullName email')
      .sort({ createdAt: -1 });

    return successResponse(res, 200, 'Pending payments retrieved successfully', payments);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};
