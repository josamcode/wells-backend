// User Roles
const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  PROJECT_MANAGER: 'project_manager',
  CONTRACTOR: 'contractor',
  VIEWER: 'viewer',
};

// Role Permissions Map
const PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: [
    'manage_all',
    'manage_users',
    'manage_roles',
    'manage_projects',
    'manage_reports',
    'manage_settings',
    'view_analytics',
    'export_data',
    'view_audit_logs',
  ],
  [ROLES.ADMIN]: [
    'manage_users',
    'manage_projects',
    'manage_reports',
    'manage_settings',
    'view_analytics',
    'export_data',
  ],
  [ROLES.PROJECT_MANAGER]: [
    'view_projects',
    'view_reports',
    'review_reports',
    'approve_reports',
    'view_analytics',
  ],
  [ROLES.CONTRACTOR]: [
    'view_assigned_projects',
    'submit_reports',
    'edit_own_reports',
    'view_own_reports',
    'view_analytics',
  ],
  [ROLES.VIEWER]: [
    'view_projects',
    'view_reports',
    'view_analytics',
  ],
};

// Project Status
const PROJECT_STATUS = {
  PLANNED: 'planned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ON_HOLD: 'on_hold',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived',
};

// Report Status
const REPORT_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

// Report Types
const REPORT_TYPES = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  MILESTONE: 'milestone',
  FINAL: 'final',
};

// Notification Types
const NOTIFICATION_TYPES = {
  PROJECT_ASSIGNED: 'project_assigned',
  REPORT_SUBMITTED: 'report_submitted',
  REPORT_APPROVED: 'report_approved',
  REPORT_REJECTED: 'report_rejected',
  PROJECT_STATUS_CHANGED: 'project_status_changed',
  USER_ROLE_CHANGED: 'user_role_changed',
  SYSTEM_ALERT: 'system_alert',
};

// Countries (example list - expand as needed)
const COUNTRIES = [
  'Saudi Arabia',
  'Yemen',
  'Jordan',
  'Palestine',
  'Syria',
  'Iraq',
  'Egypt',
  'Sudan',
  'Somalia',
  'Other',
];

// File Types
const FILE_TYPES = {
  IMAGE: ['image/jpeg', 'image/png', 'image/jpg'],
  DOCUMENT: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  SPREADSHEET: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  VIDEO: ['video/mp4', 'video/mpeg', 'video/quicktime'],
};

module.exports = {
  ROLES,
  PERMISSIONS,
  PROJECT_STATUS,
  REPORT_STATUS,
  REPORT_TYPES,
  NOTIFICATION_TYPES,
  COUNTRIES,
  FILE_TYPES,
};

