const User = require('../models/User');
const Project = require('../models/Project');
const { generateToken } = require('../config/jwt');
const { successResponse, errorResponse, sanitizeUser } = require('../utils/helpers');
const { ROLES } = require('../utils/constants');
const emailService = require('../services/email.service');
const crypto = require('crypto');

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user with password
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return errorResponse(res, 401, 'Invalid email or password');
    }

    // Check if account is active
    if (!user.isActive) {
      return errorResponse(res, 403, 'Account is deactivated');
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return errorResponse(res, 401, 'Invalid email or password');
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Return user data and token
    return successResponse(res, 200, 'Login successful', {
      user: sanitizeUser(user),
      token,
    });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    return successResponse(res, 200, 'Profile retrieved', sanitizeUser(req.user));
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, phone, organization, language } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { fullName, phone, organization, language },
      { new: true, runValidators: true }
    );

    return successResponse(res, 200, 'Profile updated successfully', sanitizeUser(user));
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    // Verify current password
    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      return errorResponse(res, 401, 'Current password is incorrect');
    }

    // Update password
    user.password = newPassword;
    await user.save();

    return successResponse(res, 200, 'Password changed successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Forgot password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email }).select('+passwordResetToken +passwordResetExpires');
    if (!user) {
      // Don't reveal if user exists
      return successResponse(res, 200, 'If email exists, password reset link has been sent');
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 3600000; // 1 hour

    await user.save();

    // Send email
    await emailService.sendPasswordResetEmail(user, resetToken);

    return successResponse(res, 200, 'If email exists, password reset link has been sent');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Hash token and find user
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      return errorResponse(res, 400, 'Invalid or expired reset token');
    }

    // Update password
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return successResponse(res, 200, 'Password reset successful');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Client login (by phone number, no password required)
exports.clientLogin = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || !phone.trim()) {
      return errorResponse(res, 400, 'Phone number is required');
    }

    // Normalize phone number (remove spaces, dashes, etc.)
    const normalizedPhone = phone.trim().replace(/[\s\-\(\)]/g, '');

    // Escape special regex characters in the phone number
    const escapedPhone = normalizedPhone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Find projects with this client phone number
    // Use exact match or regex with escaped characters
    const projects = await Project.find({
      $or: [
        { 'client.phone': normalizedPhone },
        { 'client.phone': { $regex: escapedPhone, $options: 'i' } },
      ],
      isArchived: false,
    }).select('_id projectNumber projectName client');

    if (projects.length === 0) {
      return errorResponse(res, 404, 'No projects found for this phone number');
    }

    // Get client info from first project
    const clientInfo = projects[0].client;

    // Create a virtual client user object for token generation
    // We'll use a special format: client_phone_number
    const clientUserId = `client_${normalizedPhone}`;

    // Generate token with special client identifier
    const token = generateToken(clientUserId, { isClient: true, phone: normalizedPhone });

    // Return client data and token
    return successResponse(res, 200, 'Client login successful', {
      user: {
        _id: clientUserId,
        fullName: clientInfo?.name || 'Client',
        email: clientInfo?.email || '',
        phone: normalizedPhone,
        role: ROLES.CLIENT,
        isClient: true,
      },
      token,
      projectsCount: projects.length,
    });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

