const Project = require('../models/Project');
const User = require('../models/User');
const { successResponse, errorResponse, paginate } = require('../utils/helpers');
const { PROJECT_STATUS, ROLES } = require('../utils/constants');
const googleDriveService = require('../services/googleDrive.service');
const notificationService = require('../services/notification.service');
const emailService = require('../services/email.service');
const cloudinaryService = require('../services/cloudinary.service');

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
    const query = {};

    // For Super Admin and Admin, apply archive filter if specified
    // For Project Managers and Contractors, show all their projects (archived and non-archived)
    if (req.user.role === ROLES.SUPER_ADMIN || req.user.role === ROLES.ADMIN || req.user.role === ROLES.VIEWER) {
      query.isArchived = isArchived === 'true';
    }
    // Project Managers and Contractors see all their projects regardless of archive status

    // Contractors can only see their assigned projects
    if (req.user.role === ROLES.CONTRACTOR) {
      query.contractor = req.user._id;
    }

    // Project Managers can only see projects where they are the project manager
    if (req.user.role === ROLES.PROJECT_MANAGER) {
      query.projectManager = req.user._id;
    }

    // Clients can only see projects with their email
    if (req.user.role === ROLES.CLIENT && req.clientEmail) {
      const normalizedEmail = req.clientEmail.toLowerCase();
      query['client.email'] = { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
      query.isArchived = false; // Clients only see active projects
    }

    if (status) query.status = status;
    if (country) query.country = country;

    // Apply contractor filter only if user is not restricted by role
    if (contractor && req.user.role !== ROLES.CONTRACTOR) {
      query.contractor = contractor;
    }

    // Apply projectManager filter only if user is not restricted by role
    if (projectManager && req.user.role !== ROLES.PROJECT_MANAGER) {
      query.projectManager = projectManager;
    }

    // Search functionality (only if not a client, as clients have restricted access)
    if (search && search.trim() !== '' && req.user.role !== ROLES.CLIENT) {
      query.$or = [
        { projectNumber: { $regex: search, $options: 'i' } },
        { projectName: { $regex: search, $options: 'i' } },
        { projectNameAr: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { descriptionAr: { $regex: search, $options: 'i' } },
        { country: { $regex: search, $options: 'i' } },
        { region: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
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
      .populate('createdBy', 'fullName email')
      .populate('reviewedBy', 'fullName email')
      .populate('evaluation.evaluatedBy', 'fullName email')
      .populate('contract.uploadedBy', 'fullName email');

    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    // Check access based on role
    if (req.user.role === ROLES.CONTRACTOR && project.contractor?._id.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Access denied');
    }

    if (req.user.role === ROLES.PROJECT_MANAGER && project.projectManager?._id.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Access denied');
    }

    // Clients can only access projects with their email
    if (req.user.role === ROLES.CLIENT && req.clientEmail) {
      const normalizedEmail = req.clientEmail.toLowerCase();
      const projectEmail = project.client?.email?.toLowerCase() || '';
      // Compare normalized emails (case-insensitive)
      if (projectEmail !== normalizedEmail) {
        return errorResponse(res, 403, 'Access denied');
      }
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

    // Remove projectNumber if it's empty (to trigger auto-generation)
    if (!projectData.projectNumber || projectData.projectNumber.trim() === '') {
      delete projectData.projectNumber;
    }

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
    // Build query based on user role
    const query = { isArchived: false };

    // Contractors can only see their assigned projects
    if (req.user.role === ROLES.CONTRACTOR) {
      query.contractor = req.user._id;
    }

    const projects = await Project.find(query)
      .select('projectNumber projectName status country')
      .sort({ projectNumber: -1 });

    return successResponse(res, 200, 'Projects list retrieved successfully', projects);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Review project (Admin only)
exports.reviewProject = async (req, res) => {
  try {
    const { reviewNotes, reviewStatus } = req.body;
    const projectId = req.params.id;

    const project = await Project.findById(projectId);
    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    // Update review information
    project.reviewStatus = reviewStatus || 'reviewed';
    project.reviewedBy = req.user._id;
    project.reviewedAt = new Date();
    if (reviewNotes) {
      project.reviewNotes = reviewNotes.trim();
    }

    await project.save();

    const updatedProject = await Project.findById(projectId)
      .populate('reviewedBy', 'fullName email')
      .populate('contractor', 'fullName email')
      .populate('projectManager', 'fullName email')
      .populate('evaluation.evaluatedBy', 'fullName email');

    return successResponse(res, 200, 'Project reviewed successfully', updatedProject);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Evaluate project (Admin/Staff only - not for clients)
exports.evaluateProject = async (req, res) => {
  try {
    const { overallScore, qualityScore, timelineScore, budgetScore, evaluationNotes } = req.body;
    const projectId = req.params.id;

    const project = await Project.findById(projectId);
    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    // Only admins and staff can use this endpoint
    if (req.user.role === ROLES.CLIENT) {
      return errorResponse(res, 403, 'Clients should use the client evaluation endpoint');
    }

    // Initialize evaluation object if it doesn't exist
    if (!project.evaluation) {
      project.evaluation = {};
    }

    // Update evaluation information
    if (overallScore !== undefined) project.evaluation.overallScore = overallScore;
    if (qualityScore !== undefined) project.evaluation.qualityScore = qualityScore;
    if (timelineScore !== undefined) project.evaluation.timelineScore = timelineScore;
    if (budgetScore !== undefined) project.evaluation.budgetScore = budgetScore;
    if (evaluationNotes) {
      project.evaluation.evaluationNotes = evaluationNotes.trim();
    }

    project.evaluation.evaluatedBy = req.user._id;
    project.evaluation.evaluatedAt = new Date();

    await project.save();

    const updatedProject = await Project.findById(projectId)
      .populate('reviewedBy', 'fullName email')
      .populate('contractor', 'fullName email')
      .populate('projectManager', 'fullName email')
      .populate('evaluation.evaluatedBy', 'fullName email');

    return successResponse(res, 200, 'Project evaluated successfully', updatedProject);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Client evaluation (separate endpoint for clients with 7-star rating)
exports.clientEvaluateProject = async (req, res) => {
  try {
    const { starRating, notes } = req.body;
    const projectId = req.params.id;

    // Only clients can use this endpoint
    if (req.user.role !== ROLES.CLIENT) {
      return errorResponse(res, 403, 'This endpoint is only for clients');
    }

    if (!req.clientEmail) {
      return errorResponse(res, 401, 'Client authentication required');
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    // Verify client ownership
    const normalizedEmail = req.clientEmail.toLowerCase();
    const projectEmail = project.client?.email?.toLowerCase() || '';
    if (projectEmail !== normalizedEmail) {
      return errorResponse(res, 403, 'Access denied. You can only evaluate your own projects.');
    }

    // Validate star rating
    if (!starRating || starRating < 1 || starRating > 7) {
      return errorResponse(res, 400, 'Star rating must be between 1 and 7');
    }

    // Update client evaluation
    project.clientEvaluation = {
      starRating: parseInt(starRating),
      notes: notes ? notes.trim() : '',
      evaluatedAt: new Date(),
    };

    await project.save();

    const updatedProject = await Project.findById(projectId)
      .populate('reviewedBy', 'fullName email')
      .populate('contractor', 'fullName email')
      .populate('projectManager', 'fullName email')
      .populate('evaluation.evaluatedBy', 'fullName email');

    return successResponse(res, 200, 'Project evaluated successfully', updatedProject);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Upload/Update contract (Admin only)
exports.uploadContract = async (req, res) => {
  try {
    const { id: projectId } = req.params;

    if (!req.file) {
      return errorResponse(res, 400, 'No file uploaded');
    }

    // Only allow PDF and images
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return errorResponse(res, 400, 'Only PDF and image files are allowed');
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    // Delete old contract if exists
    if (project.contract?.publicId) {
      try {
        await cloudinaryService.deleteFile(project.contract.publicId);
      } catch (error) {
        console.error('Error deleting old contract:', error);
      }
    }

    // Upload to Cloudinary with public access
    // For PDFs, explicitly set resource_type to 'raw'
    const uploadOptions = { access_mode: 'public' };
    if (req.file.mimetype === 'application/pdf') {
      uploadOptions.resource_type = 'raw';
    }

    const uploadResult = await cloudinaryService.uploadFile(
      req.file.buffer,
      req.file.originalname,
      `projects/${projectId}/contracts`,
      uploadOptions
    );

    // Update project contract
    project.contract = {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      uploadedAt: new Date(),
      uploadedBy: req.user._id,
    };

    await project.save();

    const updatedProject = await Project.findById(projectId)
      .populate('contract.uploadedBy', 'fullName email')
      .populate('contractor', 'fullName email')
      .populate('projectManager', 'fullName email');

    return successResponse(res, 200, 'Contract uploaded successfully', updatedProject);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Delete contract (Admin only)
exports.deleteContract = async (req, res) => {
  try {
    const { id: projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    if (!project.contract?.publicId) {
      return errorResponse(res, 404, 'No contract found');
    }

    // Delete from Cloudinary
    try {
      await cloudinaryService.deleteFile(project.contract.publicId);
    } catch (error) {
      console.error('Error deleting contract from Cloudinary:', error);
    }

    // Remove contract from project
    project.contract = undefined;
    await project.save();

    const updatedProject = await Project.findById(projectId)
      .populate('contractor', 'fullName email')
      .populate('projectManager', 'fullName email');

    return successResponse(res, 200, 'Contract deleted successfully', updatedProject);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get contract file (proxy through backend for secure access)
exports.getContract = async (req, res) => {
  try {
    const { id: projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return errorResponse(res, 404, 'Project not found');
    }

    if (!project.contract?.url) {
      return errorResponse(res, 404, 'No contract found');
    }

    // For clients, verify ownership
    if (req.user.role === ROLES.CLIENT) {
      if (!req.clientEmail) {
        return errorResponse(res, 401, 'Client authentication required');
      }
      const normalizedEmail = req.clientEmail.toLowerCase();
      const projectEmail = project.client?.email?.toLowerCase() || '';
      if (projectEmail !== normalizedEmail) {
        return errorResponse(res, 403, 'Access denied');
      }
    }

    // Serve the file from Cloudinary
    try {
      // First, try using the original URL stored during upload
      // This is the most reliable method since it's the URL Cloudinary generated
      if (project.contract.url) {
        const https = require('https');
        const http = require('http');
        const url = require('url');
        const contractUrl = new URL(project.contract.url);
        const protocol = contractUrl.protocol === 'https:' ? https : http;

        // Try the original URL first (works for images and properly stored PDFs)
        try {
          const originalUrlPromise = new Promise((resolve, reject) => {
            const request = protocol.get(project.contract.url, (cloudinaryRes) => {
              if (cloudinaryRes.statusCode === 200) {
                // Set appropriate headers
                res.setHeader('Content-Type', project.contract.fileType || 'application/pdf');
                res.setHeader('Content-Disposition', `inline; filename="${project.contract.fileName || 'contract.pdf'}"`);
                res.setHeader('Cache-Control', 'public, max-age=3600');

                // Pipe the response directly
                cloudinaryRes.pipe(res);
                resolve(true);
              } else {
                reject(new Error(`HTTP ${cloudinaryRes.statusCode}`));
              }
            });

            request.on('error', reject);
            request.setTimeout(10000, () => {
              request.destroy();
              reject(new Error('Request timeout'));
            });
          });

          await originalUrlPromise;
          return; // Success, file served
        } catch (originalError) {
          console.log('Original URL failed:', originalError.message);

          // For PDFs, try URL variations
          if (project.contract.fileType?.includes('pdf')) {
            const urlVariations = [
              project.contract.url.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '.pdf'),
              project.contract.url.replace(/\.[^.]+$/, '.pdf'),
            ].filter(url => url !== project.contract.url); // Only try variations

            for (const urlVariation of urlVariations) {
              try {
                const variationPromise = new Promise((resolve, reject) => {
                  const request = protocol.get(urlVariation, (cloudinaryRes) => {
                    if (cloudinaryRes.statusCode === 200) {
                      res.setHeader('Content-Type', project.contract.fileType || 'application/pdf');
                      res.setHeader('Content-Disposition', `inline; filename="${project.contract.fileName || 'contract.pdf'}"`);
                      res.setHeader('Cache-Control', 'public, max-age=3600');
                      cloudinaryRes.pipe(res);
                      resolve(true);
                    } else {
                      reject(new Error(`HTTP ${cloudinaryRes.statusCode}`));
                    }
                  });
                  request.on('error', reject);
                  request.setTimeout(10000, () => {
                    request.destroy();
                    reject(new Error('Request timeout'));
                  });
                });
                await variationPromise;
                return; // Success
              } catch (variationError) {
                console.log(`URL variation failed: ${variationError.message}`);
              }
            }
          }

          console.log('All original URL attempts failed, trying Admin API download...');
        }
      }

      // If original URL failed or doesn't exist, use Admin API
      if (!project.contract.publicId) {
        return errorResponse(res, 400, 'Contract public ID not found');
      }

      // Determine resource type - PDFs might be stored as 'image' or 'raw'
      const isPdf = project.contract.fileType?.includes('pdf');

      // Try both resource types for PDFs (they might be stored as either)
      const resourceTypesToTry = isPdf ? ['raw', 'image'] : ['image', 'raw'];

      let lastError;
      for (const resourceType of resourceTypesToTry) {
        try {
          console.log(`Trying to download contract as ${resourceType} type...`);
          const fileBuffer = await cloudinaryService.downloadFile(project.contract.publicId, {
            resource_type: resourceType,
          });

          // Set appropriate headers
          res.setHeader('Content-Type', project.contract.fileType || 'application/pdf');
          res.setHeader('Content-Disposition', `inline; filename="${project.contract.fileName || 'contract.pdf'}"`);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.setHeader('Content-Length', fileBuffer.length);

          // Send the file buffer
          res.send(fileBuffer);
          return; // Success, exit
        } catch (downloadError) {
          console.error(`Download as ${resourceType} failed:`, downloadError.message);
          lastError = downloadError;
          // Continue to next resource type
        }
      }

      // If all resource types failed, return error
      return errorResponse(res, 500, 'Failed to fetch contract file', lastError?.message || 'All download methods failed');
    } catch (error) {
      console.error('Error serving contract:', error);
      return errorResponse(res, 500, 'Server error', error.message);
    }
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

