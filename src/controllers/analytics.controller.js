const Project = require('../models/Project');
const Report = require('../models/Report');
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/helpers');
const { PROJECT_STATUS, REPORT_STATUS, ROLES } = require('../utils/constants');

// Get dashboard analytics
exports.getDashboardAnalytics = async (req, res) => {
  try {
    // Projects statistics
    const totalProjects = await Project.countDocuments({ isArchived: false });
    const completedProjects = await Project.countDocuments({
      status: PROJECT_STATUS.COMPLETED,
      isArchived: false,
    });
    const inProgressProjects = await Project.countDocuments({
      status: PROJECT_STATUS.IN_PROGRESS,
      isArchived: false,
    });

    // Delayed projects
    const delayedProjects = await Project.countDocuments({
      status: { $in: [PROJECT_STATUS.IN_PROGRESS, PROJECT_STATUS.PLANNED] },
      expectedEndDate: { $lt: new Date() },
      isArchived: false,
    });

    // Reports statistics
    const totalReports = await Report.countDocuments();
    const pendingReports = await Report.countDocuments({
      status: { $in: [REPORT_STATUS.SUBMITTED, REPORT_STATUS.UNDER_REVIEW] },
    });
    const approvedReports = await Report.countDocuments({ status: REPORT_STATUS.APPROVED });

    // Projects by country
    const projectsByCountry = await Project.aggregate([
      { $match: { isArchived: false } },
      {
        $group: {
          _id: '$country',
          count: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', PROJECT_STATUS.COMPLETED] }, 1, 0] },
          },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Monthly project completions (last 12 months)
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

    // Recent projects
    const recentProjects = await Project.find({ isArchived: false })
      .populate('contractor', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('projectNumber projectName status country createdAt');

    // Recent reports
    const recentReports = await Report.find()
      .populate('project', 'projectNumber projectName')
      .populate('submittedBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('reportNumber title status submittedAt');

    // Active contractors
    const activeContractors = await User.countDocuments({
      role: ROLES.CONTRACTOR,
      isActive: true,
    });

    // Total budget (sum of all projects)
    const budgetAgg = await Project.aggregate([
      { $match: { isArchived: false } },
      {
        $group: {
          _id: null,
          total: { $sum: '$budget.amount' },
        },
      },
    ]);
    const totalBudget = budgetAgg[0]?.total || 0;

    return successResponse(res, 200, 'Dashboard analytics retrieved successfully', {
      projects: {
        total: totalProjects,
        completed: completedProjects,
        inProgress: inProgressProjects,
        delayed: delayedProjects,
        completionRate: totalProjects > 0 ? (completedProjects / totalProjects) * 100 : 0,
      },
      reports: {
        total: totalReports,
        pending: pendingReports,
        approved: approvedReports,
      },
      budget: {
        total: totalBudget,
        currency: 'USD',
      },
      activeContractors,
      projectsByCountry,
      monthlyCompletions,
      recentProjects,
      recentReports,
    });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Export data (CSV/Excel)
exports.exportData = async (req, res) => {
  try {
    const { type = 'projects', format = 'csv' } = req.query;

    let data = [];

    if (type === 'projects') {
      data = await Project.find({ isArchived: false })
        .populate('contractor', 'fullName email')
        .populate('projectManager', 'fullName email')
        .lean();
    } else if (type === 'reports') {
      data = await Report.find()
        .populate('project', 'projectNumber projectName')
        .populate('submittedBy', 'fullName email')
        .lean();
    }

    // For CSV format
    if (format === 'csv') {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(type);

      // Add headers
      if (type === 'projects') {
        worksheet.columns = [
          { header: 'Project Number', key: 'projectNumber', width: 15 },
          { header: 'Project Name', key: 'projectName', width: 30 },
          { header: 'Country', key: 'country', width: 15 },
          { header: 'Status', key: 'status', width: 15 },
          { header: 'Progress', key: 'progress', width: 10 },
          { header: 'Contractor', key: 'contractor', width: 25 },
          { header: 'Start Date', key: 'startDate', width: 15 },
          { header: 'Expected End', key: 'expectedEndDate', width: 15 },
        ];

        data.forEach((project) => {
          worksheet.addRow({
            projectNumber: project.projectNumber,
            projectName: project.projectName,
            country: project.country,
            status: project.status,
            progress: `${project.progress}%`,
            contractor: project.contractor?.fullName || 'N/A',
            startDate: project.startDate ? new Date(project.startDate).toLocaleDateString() : 'N/A',
            expectedEndDate: project.expectedEndDate
              ? new Date(project.expectedEndDate).toLocaleDateString()
              : 'N/A',
          });
        });
      } else if (type === 'reports') {
        worksheet.columns = [
          { header: 'Report Number', key: 'reportNumber', width: 15 },
          { header: 'Title', key: 'title', width: 30 },
          { header: 'Project', key: 'project', width: 30 },
          { header: 'Status', key: 'status', width: 15 },
          { header: 'Submitted By', key: 'submittedBy', width: 25 },
          { header: 'Submitted At', key: 'submittedAt', width: 15 },
        ];

        data.forEach((report) => {
          worksheet.addRow({
            reportNumber: report.reportNumber,
            title: report.title,
            project: report.project?.projectName || 'N/A',
            status: report.status,
            submittedBy: report.submittedBy?.fullName || 'N/A',
            submittedAt: report.submittedAt
              ? new Date(report.submittedAt).toLocaleDateString()
              : 'N/A',
          });
        });
      }

      // Generate file
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=${type}-export.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } else {
      return successResponse(res, 200, 'Data retrieved successfully', data);
    }
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

