const Report = require('../models/Report');
const Project = require('../models/Project');
const User = require('../models/User');
const { successResponse, errorResponse, paginate } = require('../utils/helpers');
const { REPORT_STATUS, ROLES } = require('../utils/constants');
const googleDriveService = require('../services/googleDrive.service');
const notificationService = require('../services/notification.service');
const emailService = require('../services/email.service');
const fs = require('fs');

// Get all reports with pagination and filters
exports.getReports = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      project,
      reportType,
      submittedBy,
      startDate,
      endDate,
      search,
    } = req.query;
    const { skip, limit: pageLimit } = paginate(page, limit);

    // Build query based on user role
    const query = {};

    // Contractors can only see their own reports
    if (req.user.role === ROLES.CONTRACTOR) {
      query.submittedBy = req.user._id;
    }

    if (status) query.status = status;
    if (project) query.project = project;
    if (reportType) query.reportType = reportType;
    if (submittedBy) query.submittedBy = submittedBy;
    if (startDate || endDate) {
      query.workDate = {};
      if (startDate) query.workDate.$gte = new Date(startDate);
      if (endDate) query.workDate.$lte = new Date(endDate);
    }

    // Search functionality - search across multiple fields
    if (search && search.trim() !== '') {
      query.$or = [
        { reportNumber: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { titleAr: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { descriptionAr: { $regex: search, $options: 'i' } },
        { workCompleted: { $regex: search, $options: 'i' } },
        { workCompletedAr: { $regex: search, $options: 'i' } },
        { challenges: { $regex: search, $options: 'i' } },
        { challengesAr: { $regex: search, $options: 'i' } },
        { nextSteps: { $regex: search, $options: 'i' } },
        { nextStepsAr: { $regex: search, $options: 'i' } },
      ];
    }

    const reports = await Report.find(query)
      .populate('project', 'projectNumber projectName country')
      .populate('submittedBy', 'fullName email')
      .populate('reviewedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit);

    const total = await Report.countDocuments(query);

    return successResponse(res, 200, 'Reports retrieved successfully', {
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / pageLimit),
      },
    });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get single report
exports.getReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('project')
      .populate('submittedBy', 'fullName email phone')
      .populate('reviewedBy', 'fullName email');

    if (!report) {
      return errorResponse(res, 404, 'Report not found');
    }

    // Check access
    if (
      req.user.role === ROLES.CONTRACTOR &&
      report.submittedBy._id.toString() !== req.user._id.toString()
    ) {
      return errorResponse(res, 403, 'Access denied');
    }

    return successResponse(res, 200, 'Report retrieved successfully', report);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Create report
exports.createReport = async (req, res) => {
  try {
    const reportData = {
      ...req.body,
      submittedBy: req.user._id,
    };

    // Verify project exists
    const project = await Project.findById(req.body.project);
    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    // Verify contractor is assigned to project
    if (req.user.role === ROLES.CONTRACTOR && project.contractor?.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'You are not assigned to this project');
    }

    const report = await Report.create(reportData);

    return successResponse(res, 201, 'Report created successfully', report);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Update report
exports.updateReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return errorResponse(res, 404, 'Report not found');
    }

    // Check permissions
    if (req.user.role === ROLES.CONTRACTOR) {
      // Contractors can only edit their own draft/rejected reports
      if (
        report.submittedBy.toString() !== req.user._id.toString() ||
        ![REPORT_STATUS.DRAFT, REPORT_STATUS.REJECTED].includes(report.status)
      ) {
        return errorResponse(res, 403, 'Cannot edit this report');
      }
    }

    // Update report
    Object.assign(report, req.body);
    await report.save();

    const updatedReport = await Report.findById(report._id)
      .populate('project')
      .populate('submittedBy', 'fullName email');

    return successResponse(res, 200, 'Report updated successfully', updatedReport);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Delete report
exports.deleteReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return errorResponse(res, 404, 'Report not found');
    }

    // Only allow deleting draft reports or by admin
    if (
      req.user.role === ROLES.CONTRACTOR &&
      (report.submittedBy.toString() !== req.user._id.toString() ||
        report.status !== REPORT_STATUS.DRAFT)
    ) {
      return errorResponse(res, 403, 'Cannot delete this report');
    }

    // Delete attachments from Google Drive
    if (report.attachments?.length > 0) {
      for (const attachment of report.attachments) {
        if (attachment.googleDriveFileId) {
          try {
            await googleDriveService.deleteFile(attachment.googleDriveFileId);
          } catch (err) {
            console.error('Failed to delete file from Drive:', err);
          }
        }
      }
    }

    await Report.findByIdAndDelete(req.params.id);

    return successResponse(res, 200, 'Report deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Submit report for review
exports.submitReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id).populate('project');
    if (!report) {
      return errorResponse(res, 404, 'Report not found');
    }

    // Check if contractor owns the report
    if (report.submittedBy.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Access denied');
    }

    // Update status
    report.status = REPORT_STATUS.SUBMITTED;
    report.submittedAt = new Date();
    await report.save();

    // Notify project managers and admins
    const managers = await User.find({
      $or: [
        { role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER] } },
        { _id: report.project.projectManager },
      ],
      isActive: true,
    });

    const managerIds = managers.map((m) => m._id);
    await notificationService.notifyReportSubmission(
      report._id,
      managerIds,
      report.title,
      report.project.projectName
    );

    return successResponse(res, 200, 'Report submitted successfully', report);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Review report (approve/reject)
exports.reviewReport = async (req, res) => {
  try {
    const { action, reviewNotes, rejectionReason } = req.body;
    const report = await Report.findById(req.params.id).populate('project').populate('submittedBy');

    if (!report) {
      return errorResponse(res, 404, 'Report not found');
    }

    if (![REPORT_STATUS.SUBMITTED, REPORT_STATUS.UNDER_REVIEW].includes(report.status)) {
      return errorResponse(res, 400, 'Report is not pending review');
    }

    if (action === 'approve') {
      report.status = REPORT_STATUS.APPROVED;
      report.reviewedBy = req.user._id;
      report.reviewedAt = new Date();
      report.reviewNotes = reviewNotes;

      // Notify contractor
      await notificationService.notifyReportApproval(
        report._id,
        report.submittedBy._id,
        report.title
      );
      await emailService.sendReportApprovedEmail(report, report.project, report.submittedBy);

      // Update project progress if provided
      if (report.progressPercentage !== undefined) {
        await Project.findByIdAndUpdate(report.project._id, {
          progress: report.progressPercentage,
        });
      }
    } else if (action === 'reject') {
      if (!rejectionReason) {
        return errorResponse(res, 400, 'Rejection reason is required');
      }

      report.status = REPORT_STATUS.REJECTED;
      report.reviewedBy = req.user._id;
      report.reviewedAt = new Date();
      report.rejectionReason = rejectionReason;
      report.reviewNotes = reviewNotes;

      // Notify contractor
      await notificationService.notifyReportRejection(
        report._id,
        report.submittedBy._id,
        report.title,
        rejectionReason
      );
      await emailService.sendReportRejectedEmail(report, report.project, report.submittedBy, rejectionReason);
    } else {
      return errorResponse(res, 400, 'Invalid action');
    }

    await report.save();

    return successResponse(res, 200, `Report ${action}d successfully`, report);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Upload attachments to report
exports.uploadAttachments = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id).populate('project');
    if (!report) {
      return errorResponse(res, 404, 'Report not found');
    }

    if (!req.files || req.files.length === 0) {
      return errorResponse(res, 400, 'No files uploaded');
    }

    const uploadedAttachments = [];

    // Upload each file to Google Drive
    for (const file of req.files) {
      try {
        let driveFileData = null;

        if (googleDriveService.drive && report.project.googleDriveFolderId) {
          // Get or create Reports subfolder
          const year = new Date().getFullYear();
          const month = String(new Date().getMonth() + 1).padStart(2, '0');
          const folderName = `${year}-${month}`;

          // Upload to Drive
          driveFileData = await googleDriveService.uploadFile(
            file.path,
            file.originalname,
            report.project.googleDriveFolderId,
            file.mimetype
          );
        }

        uploadedAttachments.push({
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          googleDriveFileId: driveFileData?.id,
          googleDriveUrl: driveFileData?.url,
        });

        // Delete temp file
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('File upload error:', err);
        // Continue with other files
      }
    }

    // Add attachments to report
    report.attachments.push(...uploadedAttachments);
    await report.save();

    return successResponse(res, 200, 'Attachments uploaded successfully', report);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Delete attachment
exports.deleteAttachment = async (req, res) => {
  try {
    const { reportId, attachmentId } = req.params;
    const report = await Report.findById(reportId);

    if (!report) {
      return errorResponse(res, 404, 'Report not found');
    }

    const attachment = report.attachments.id(attachmentId);
    if (!attachment) {
      return errorResponse(res, 404, 'Attachment not found');
    }

    // Delete from Google Drive
    if (attachment.googleDriveFileId) {
      try {
        await googleDriveService.deleteFile(attachment.googleDriveFileId);
      } catch (err) {
        console.error('Failed to delete from Drive:', err);
      }
    }

    // Remove from report
    report.attachments.pull(attachmentId);
    await report.save();

    return successResponse(res, 200, 'Attachment deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get report statistics
exports.getReportStats = async (req, res) => {
  try {
    const total = await Report.countDocuments();
    const submitted = await Report.countDocuments({ status: REPORT_STATUS.SUBMITTED });
    const underReview = await Report.countDocuments({ status: REPORT_STATUS.UNDER_REVIEW });
    const approved = await Report.countDocuments({ status: REPORT_STATUS.APPROVED });
    const rejected = await Report.countDocuments({ status: REPORT_STATUS.REJECTED });

    // Reports by type
    const byType = await Report.aggregate([
      { $group: { _id: '$reportType', count: { $sum: 1 } } },
    ]);

    return successResponse(res, 200, 'Report statistics retrieved successfully', {
      total,
      submitted,
      underReview,
      approved,
      rejected,
      byType,
    });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

