const Settings = require('../models/Settings');
const { successResponse, errorResponse } = require('../utils/helpers');
const googleDriveService = require('../services/googleDrive.service');

// Get all settings or by category
exports.getSettings = async (req, res) => {
  try {
    const { category } = req.query;
    const query = {};

    if (category) {
      query.category = category;
    }

    // Non-admins can only see public settings
    if (!['super_admin', 'admin'].includes(req.user?.role)) {
      query.isPublic = true;
    }

    const settings = await Settings.find(query);

    // Convert to key-value object
    const settingsObj = {};
    settings.forEach((setting) => {
      settingsObj[setting.key] = setting.value;
    });

    return successResponse(res, 200, 'Settings retrieved successfully', settingsObj);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get single setting by key
exports.getSetting = async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: req.params.key });

    if (!setting) {
      return errorResponse(res, 404, 'Setting not found');
    }

    // Check if user can access this setting
    if (!setting.isPublic && !['super_admin', 'admin'].includes(req.user?.role)) {
      return errorResponse(res, 403, 'Access denied');
    }

    return successResponse(res, 200, 'Setting retrieved successfully', {
      key: setting.key,
      value: setting.value,
    });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Update or create setting
exports.updateSetting = async (req, res) => {
  try {
    const { key, value, category, description, isPublic } = req.body;

    const setting = await Settings.findOneAndUpdate(
      { key },
      {
        key,
        value,
        category,
        description,
        isPublic,
        updatedBy: req.user._id,
      },
      { new: true, upsert: true, runValidators: true }
    );

    return successResponse(res, 200, 'Setting updated successfully', setting);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Update multiple settings
exports.updateMultipleSettings = async (req, res) => {
  try {
    const { settings } = req.body;

    const updatePromises = Object.entries(settings).map(([key, value]) =>
      Settings.findOneAndUpdate(
        { key },
        {
          key,
          value,
          updatedBy: req.user._id,
        },
        { new: true, upsert: true }
      )
    );

    await Promise.all(updatePromises);

    return successResponse(res, 200, 'Settings updated successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Delete setting
exports.deleteSetting = async (req, res) => {
  try {
    const setting = await Settings.findOneAndDelete({ key: req.params.key });

    if (!setting) {
      return errorResponse(res, 404, 'Setting not found');
    }

    return successResponse(res, 200, 'Setting deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Initialize Google Drive
exports.initializeGoogleDrive = async (req, res) => {
  try {
    const { type, credentials } = req.body;

    let credentialsData = {
      type,
    };

    if (type === 'service_account') {
      credentialsData.client_email = credentials.client_email;
      credentialsData.private_key = credentials.private_key;
    } else if (type === 'oauth') {
      credentialsData.client_id = credentials.client_id;
      credentialsData.client_secret = credentials.client_secret;
      credentialsData.redirect_uri = credentials.redirect_uri;
      credentialsData.refresh_token = credentials.refresh_token;
    }

    // Initialize Google Drive service
    const success = await googleDriveService.initialize(credentialsData);

    if (!success) {
      return errorResponse(res, 400, 'Failed to initialize Google Drive');
    }

    // Save credentials to settings
    await Settings.findOneAndUpdate(
      { key: 'google_drive_credentials' },
      {
        key: 'google_drive_credentials',
        value: credentialsData,
        category: 'google_drive',
        isPublic: false,
        updatedBy: req.user._id,
      },
      { upsert: true }
    );

    await Settings.findOneAndUpdate(
      { key: 'google_drive_enabled' },
      {
        key: 'google_drive_enabled',
        value: true,
        category: 'google_drive',
        isPublic: true,
        updatedBy: req.user._id,
      },
      { upsert: true }
    );

    return successResponse(res, 200, 'Google Drive initialized successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get Google Drive status
exports.getGoogleDriveStatus = async (req, res) => {
  try {
    const enabledSetting = await Settings.findOne({ key: 'google_drive_enabled' });
    const enabled = enabledSetting?.value || false;

    return successResponse(res, 200, 'Google Drive status retrieved', {
      enabled,
      connected: !!googleDriveService.drive,
    });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Update theme colors
exports.updateTheme = async (req, res) => {
  try {
    const { primaryColor, secondaryColor, mode } = req.body;

    await Settings.findOneAndUpdate(
      { key: 'theme_settings' },
      {
        key: 'theme_settings',
        value: {
          primaryColor,
          secondaryColor,
          mode: mode || 'light',
        },
        category: 'theme',
        isPublic: true,
        updatedBy: req.user._id,
      },
      { upsert: true }
    );

    return successResponse(res, 200, 'Theme updated successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

