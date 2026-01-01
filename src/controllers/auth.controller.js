const User = require('../models/User');
const Project = require('../models/Project');
const OTP = require('../models/OTP');
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

    // Send email (non-blocking - continue even if email fails for security)
    try {
      await emailService.sendPasswordResetEmail(user, resetToken);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError.message);
      // Continue with request even if email fails (security best practice - don't reveal if email exists)
    }

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

// Send OTP to client email
exports.clientSendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return errorResponse(res, 400, 'Email is required');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find projects with this client email
    const projects = await Project.find({
      'client.email': { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      isArchived: false,
    }).select('_id projectNumber projectName client').limit(1);

    if (projects.length === 0) {
      return errorResponse(res, 404, 'No projects found for this email address');
    }

    // Get client info
    const clientInfo = projects[0].client;

    // Generate OTP
    const otp = OTP.generateOTP();

    // Set expiration (10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Delete any existing OTPs for this email
    await OTP.deleteMany({ email: normalizedEmail });

    // Save new OTP
    await OTP.create({
      email: normalizedEmail,
      otp,
      expiresAt,
    });

    // Send OTP email (non-blocking - continue even if email fails)
    try {
      await emailService.sendClientOTPEmail(normalizedEmail, otp, clientInfo?.name || 'Client');
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError.message);
      // Continue with request even if email fails (OTP is saved in DB, user can contact support)
    }

    return successResponse(res, 200, 'OTP has been sent to your email');
  } catch (error) {
    console.error('Error sending OTP:', error);
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Client login (by email and OTP)
exports.clientLogin = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !email.trim()) {
      return errorResponse(res, 400, 'Email is required');
    }

    if (!otp || !otp.trim()) {
      return errorResponse(res, 400, 'OTP is required');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find OTP record
    const otpRecord = await OTP.findOne({ email: normalizedEmail }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return errorResponse(res, 400, 'OTP not found. Please request a new OTP.');
    }

    // Verify OTP
    const verification = otpRecord.verify(otp.trim());
    await otpRecord.save(); // Save updated attempts

    if (!verification.valid) {
      return errorResponse(res, 400, verification.error || 'Invalid OTP');
    }

    // Find projects with this client email
    const projects = await Project.find({
      'client.email': { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      isArchived: false,
    }).select('_id projectNumber projectName client');

    if (projects.length === 0) {
      return errorResponse(res, 404, 'No projects found for this email');
    }

    // Get client info from first project
    const clientInfo = projects[0].client;

    // Delete used OTP
    await OTP.deleteOne({ _id: otpRecord._id });

    // Create a virtual client user object for token generation
    // We'll use a special format: client_email
    const clientUserId = `client_${normalizedEmail}`;

    // Generate token with special client identifier
    const token = generateToken(clientUserId, { isClient: true, email: normalizedEmail });

    // Return client data and token
    return successResponse(res, 200, 'Client login successful', {
      user: {
        _id: clientUserId,
        fullName: clientInfo?.name || 'Client',
        email: normalizedEmail,
        phone: clientInfo?.phone || '',
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

