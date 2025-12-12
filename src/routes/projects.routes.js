const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const projectsController = require('../controllers/projects.controller');
const { authenticate } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validation');
const { logAudit } = require('../middlewares/auditLog');

// Get all projects
router.get(
  '/',
  authenticate,
  authorize('view_projects', 'view_assigned_projects', 'view_own_projects'),
  projectsController.getProjects
);

// Get project statistics
router.get(
  '/stats',
  authenticate,
  authorize('view_analytics'),
  projectsController.getProjectStats
);

// Get projects list (simple)
router.get(
  '/list',
  authenticate,
  projectsController.getProjectsList
);

// Review project (Admin only) - Must be before /:id route
router.post(
  '/:id/review',
  authenticate,
  authorize('manage_projects'),
  [
    body('reviewStatus').optional().isIn(['pending', 'reviewed', 'approved', 'needs_revision']),
    body('reviewNotes').optional().trim(),
    validate,
  ],
  logAudit('review_project', 'project'),
  projectsController.reviewProject
);

// Evaluate project (Admin only) - Must be before /:id route
router.post(
  '/:id/evaluate',
  authenticate,
  authorize('manage_projects'),
  [
    body('overallScore').optional().isFloat({ min: 0, max: 10 }),
    body('qualityScore').optional().isFloat({ min: 0, max: 10 }),
    body('timelineScore').optional().isFloat({ min: 0, max: 10 }),
    body('budgetScore').optional().isFloat({ min: 0, max: 10 }),
    body('evaluationNotes').optional().trim(),
    validate,
  ],
  logAudit('evaluate_project', 'project'),
  projectsController.evaluateProject
);

// Get single project
router.get(
  '/:id',
  authenticate,
  authorize('view_projects', 'view_assigned_projects', 'view_own_projects'),
  projectsController.getProject
);

// Create project
router.post(
  '/',
  authenticate,
  authorize('create_project', 'manage_projects'),
  [
    body('projectName').trim().notEmpty().withMessage('Project name is required'),
    body('country').trim().notEmpty().withMessage('Country is required'),
    body('status').optional().isIn(['planned', 'in_progress', 'completed', 'on_hold', 'cancelled', 'archived']),
    body('startDate').optional().isISO8601(),
    body('expectedEndDate').optional().isISO8601(),
    validate,
  ],
  logAudit('create_project', 'project'),
  projectsController.createProject
);

// Update project
router.put(
  '/:id',
  authenticate,
  authorize('edit_project', 'manage_projects'),
  [
    body('projectName').optional().trim().notEmpty(),
    body('country').optional().trim().notEmpty(),
    body('status').optional().isIn(['planned', 'in_progress', 'completed', 'on_hold', 'cancelled', 'archived']),
    body('startDate').optional().isISO8601(),
    body('expectedEndDate').optional().isISO8601(),
    validate,
  ],
  logAudit('update_project', 'project'),
  projectsController.updateProject
);

// Delete project
router.delete(
  '/:id',
  authenticate,
  authorize('manage_projects'),
  logAudit('delete_project', 'project'),
  projectsController.deleteProject
);

// Toggle archive project
router.patch(
  '/:id/toggle-archive',
  authenticate,
  authorize('manage_projects'),
  logAudit('toggle_archive_project', 'project'),
  projectsController.toggleArchiveProject
);

// Update project status
router.patch(
  '/:id/status',
  authenticate,
  authorize('edit_project', 'manage_projects'),
  [
    body('status').isIn(['planned', 'in_progress', 'completed', 'on_hold', 'cancelled', 'archived']),
    validate,
  ],
  logAudit('update_project_status', 'project'),
  projectsController.updateProjectStatus
);

module.exports = router;

