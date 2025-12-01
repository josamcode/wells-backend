const Project = require('../models/Project');
const User = require('../models/User');
const { successResponse, errorResponse, paginate } = require('../utils/helpers');
const { PROJECT_STATUS, ROLES } = require('../utils/constants');
const googleDriveService = require('../services/googleDrive.service');
const notificationService = require('../services/notification.service');
const emailService = require('../services/email.service');

// Get all projects with pagination and filters
exports.getProjects = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      country,
      contractor,
      projectManager,
      search,
      isArchived = 'false',
    } = req.query;
    const { skip, limit: pageLimit } = paginate(page, limit);

    // Build query based on user role
    const query = { isArchived: isArchived === 'true' };

    // Contractors can only see their assigned projects
    if (req.user.role === ROLES.CONTRACTOR) {
      query.contractor = req.user._id;
    }

    if (status) query.status = status;
    if (country) query.country = country;
    if (contractor) query.contractor = contractor;
    if (projectManager) query.projectManager = projectManager;
    if (search) {
      query.$or = [
        { projectNumber: { $regex: search, $options: 'i' } },
        { projectName: { $regex: search, $options: 'i' } },
        { projectNameAr: { $regex: search, $options: 'i' } },
      ];
    }

    const projects = await Project.find(query)
      .populate('contractor', 'fullName email')
      .populate('projectManager', 'fullName email')
      .populate('createdBy', 'fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit);

    const total = await Project.countDocuments(query);

    return successResponse(res, 200, 'Projects retrieved successfully', {
      projects,
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

// Get single project
exports.getProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('contractor', 'fullName email phone organization')
      .populate('projectManager', 'fullName email phone')
      .populate('createdBy', 'fullName email');

    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    // Check access (contractors can only view their projects)
    if (req.user.role === ROLES.CONTRACTOR && project.contractor?._id.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Access denied');
    }

    return successResponse(res, 200, 'Project retrieved successfully', project);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Create project
exports.createProject = async (req, res) => {
  try {
    const projectData = {
      ...req.body,
      createdBy: req.user._id,
    };

    const project = await Project.create(projectData);

    // Create Google Drive folder if configured
    try {
      if (googleDriveService.drive) {
        const folderStructure = await googleDriveService.createProjectFolderStructure(
          project.projectNumber,
          project.projectName
        );
        project.googleDriveFolderId = folderStructure.projectFolder.id;
        project.googleDriveFolderUrl = folderStructure.projectFolder.url;
        await project.save();
      }
    } catch (driveError) {
      console.error('Google Drive folder creation failed:', driveError);
    }

    // Notify contractor if assigned
    if (project.contractor) {
      const contractor = await User.findById(project.contractor);
      if (contractor) {
        await notificationService.notifyProjectAssignment(
          project._id,
          contractor._id,
          project.projectName
        );
        await emailService.sendProjectAssignedEmail(project, contractor);
      }
    }

    return successResponse(res, 201, 'Project created successfully', project);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Update project
exports.updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    const oldContractor = project.contractor?.toString();
    const newContractor = req.body.contractor;

    // Update project
    Object.assign(project, req.body);
    await project.save();

    // Notify if contractor changed
    if (newContractor && oldContractor !== newContractor) {
      const contractor = await User.findById(newContractor);
      if (contractor) {
        await notificationService.notifyProjectAssignment(
          project._id,
          contractor._id,
          project.projectName
        );
        await emailService.sendProjectAssignedEmail(project, contractor);
      }
    }

    const updatedProject = await Project.findById(project._id)
      .populate('contractor', 'fullName email')
      .populate('projectManager', 'fullName email');

    return successResponse(res, 200, 'Project updated successfully', updatedProject);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Delete project
exports.deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    await Project.findByIdAndDelete(req.params.id);

    return successResponse(res, 200, 'Project deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Archive/Unarchive project
exports.toggleArchiveProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    project.isArchived = !project.isArchived;
    await project.save();

    return successResponse(
      res,
      200,
      `Project ${project.isArchived ? 'archived' : 'unarchived'} successfully`,
      project
    );
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Update project status
exports.updateProjectStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    project.status = status;
    if (status === PROJECT_STATUS.COMPLETED) {
      project.actualEndDate = new Date();
      project.progress = 100;
    }

    await project.save();

    return successResponse(res, 200, 'Project status updated successfully', project);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get project statistics
exports.getProjectStats = async (req, res) => {
  try {
    const total = await Project.countDocuments({ isArchived: false });
    const completed = await Project.countDocuments({ status: PROJECT_STATUS.COMPLETED, isArchived: false });
    const inProgress = await Project.countDocuments({ status: PROJECT_STATUS.IN_PROGRESS, isArchived: false });
    const planned = await Project.countDocuments({ status: PROJECT_STATUS.PLANNED, isArchived: false });
    const onHold = await Project.countDocuments({ status: PROJECT_STATUS.ON_HOLD, isArchived: false });

    // Projects by country
    const byCountry = await Project.aggregate([
      { $match: { isArchived: false } },
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Projects by status
    const byStatus = await Project.aggregate([
      { $match: { isArchived: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // Monthly completion trend (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const monthlyCompletions = await Project.aggregate([
      {
        $match: {
          status: PROJECT_STATUS.COMPLETED,
          actualEndDate: { $gte: twelveMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$actualEndDate' },
            month: { $month: '$actualEndDate' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Delayed projects
    const delayed = await Project.countDocuments({
      status: { $in: [PROJECT_STATUS.IN_PROGRESS, PROJECT_STATUS.PLANNED] },
      expectedEndDate: { $lt: new Date() },
      isArchived: false,
    });

    return successResponse(res, 200, 'Project statistics retrieved successfully', {
      total,
      completed,
      inProgress,
      planned,
      onHold,
      delayed,
      byCountry,
      byStatus,
      monthlyCompletions,
    });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get projects for dropdown (simple list)
exports.getProjectsList = async (req, res) => {
  try {
    const projects = await Project.find({ isArchived: false })
      .select('projectNumber projectName status country')
      .sort({ projectNumber: -1 });

    return successResponse(res, 200, 'Projects list retrieved successfully', projects);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

