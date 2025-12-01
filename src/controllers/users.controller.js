const User = require('../models/User');
const { successResponse, errorResponse, sanitizeUser, paginate, generatePassword } = require('../utils/helpers');
const { ROLES } = require('../utils/constants');
const emailService = require('../services/email.service');

// Get all users with pagination and filters
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, isActive, search } = req.query;
    const { skip, limit: pageLimit } = paginate(page, limit);

    // Build query
    const query = {};
    if (role && role !== '') query.role = role;
    if (isActive !== undefined && isActive !== '') {
      query.isActive = isActive === 'true';
    }
    if (search && search.trim() !== '') {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { organization: { $regex: search, $options: 'i' } },
      ];
    }

    // Debug logging in development
    if (process.env.NODE_ENV === 'development') {
      const totalUsers = await User.countDocuments({});
      console.log('🔍 Users Query Debug:', {
        query,
        page,
        limit,
        skip,
        totalUsersInDB: totalUsers,
        queryParams: { role, isActive, search },
      });
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit);

    const total = await User.countDocuments(query);

    // Debug logging in development
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Users Query Result:', {
        found: users.length,
        total,
        userRoles: users.map(u => ({ id: u._id, email: u.email, role: u.role })),
      });
    }

    return successResponse(res, 200, 'Users retrieved successfully', {
      users: users.map(sanitizeUser),
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

// Get single user
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    return successResponse(res, 200, 'User retrieved successfully', sanitizeUser(user));
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Create user
exports.createUser = async (req, res) => {
  try {
    const { fullName, email, role, phone, organization, country } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, 400, 'Email already exists');
    }

    // Generate temporary password
    const temporaryPassword = generatePassword();

    // Create user
    const user = await User.create({
      fullName,
      email,
      password: temporaryPassword,
      role: role || ROLES.VIEWER,
      phone,
      organization,
      country,
      isActive: true,
    });

    // Send welcome email
    await emailService.sendWelcomeEmail(user, temporaryPassword);

    return successResponse(res, 201, 'User created successfully', sanitizeUser(user));
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Update user
exports.updateUser = async (req, res) => {
  try {
    const { fullName, role, phone, organization, country, isActive } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    // Prevent changing super admin role (except by super admin)
    if (user.role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
      return errorResponse(res, 403, 'Cannot modify super admin');
    }

    // Update fields
    if (fullName) user.fullName = fullName;
    if (role) user.role = role;
    if (phone !== undefined) user.phone = phone;
    if (organization !== undefined) user.organization = organization;
    if (country !== undefined) user.country = country;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    return successResponse(res, 200, 'User updated successfully', sanitizeUser(user));
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    // Prevent deleting super admin
    if (user.role === ROLES.SUPER_ADMIN) {
      return errorResponse(res, 403, 'Cannot delete super admin');
    }

    // Prevent deleting self
    if (user._id.toString() === req.user._id.toString()) {
      return errorResponse(res, 403, 'Cannot delete your own account');
    }

    await User.findByIdAndDelete(req.params.id);

    return successResponse(res, 200, 'User deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Activate/Deactivate user
exports.toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    // Prevent deactivating super admin
    if (user.role === ROLES.SUPER_ADMIN) {
      return errorResponse(res, 403, 'Cannot deactivate super admin');
    }

    user.isActive = !user.isActive;
    await user.save();

    return successResponse(
      res,
      200,
      `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      sanitizeUser(user)
    );
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get users by role (for dropdowns)
exports.getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;

    const users = await User.find({ role, isActive: true })
      .select('fullName email role')
      .sort({ fullName: 1 });

    return successResponse(res, 200, 'Users retrieved successfully', users);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get user statistics
exports.getUserStats = async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          inactive: { $sum: { $cond: ['$isActive', 0, 1] } },
        },
      },
    ]);

    const total = await User.countDocuments();
    const active = await User.countDocuments({ isActive: true });

    return successResponse(res, 200, 'User statistics retrieved successfully', {
      total,
      active,
      inactive: total - active,
      byRole: stats,
    });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

