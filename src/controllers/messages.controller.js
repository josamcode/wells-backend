const Message = require('../models/Message');
const User = require('../models/User');
const Project = require('../models/Project');
const { successResponse, errorResponse, paginate } = require('../utils/helpers');
const { ROLES } = require('../utils/constants');

// Helper: Get allowed recipients based on user role
const getAllowedRecipients = async (user) => {
  const allowedRecipients = [];

  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN) {
    // Admins can message anyone
    const allUsers = await User.find({ isActive: true }).select('_id fullName email role');
    allowedRecipients.push(...allUsers);
  } else if (user.role === ROLES.PROJECT_MANAGER) {
    // Project Managers can message: Admins + Contractors assigned to their projects
    const admins = await User.find({
      role: { $in: [ROLES.SUPER_ADMIN, ROLES.ADMIN] },
      isActive: true,
    }).select('_id fullName email role');
    allowedRecipients.push(...admins);

    // Get contractors from projects managed by this PM
    const projects = await Project.find({ projectManager: user._id }).select('contractor');
    const contractorIds = [...new Set(projects.map((p) => p.contractor?.toString()).filter(Boolean))];
    if (contractorIds.length > 0) {
      const contractors = await User.find({
        _id: { $in: contractorIds },
        isActive: true,
      }).select('_id fullName email role');
      allowedRecipients.push(...contractors);
    }
  } else if (user.role === ROLES.CONTRACTOR) {
    // Contractors can message: Admins + Project Managers who manage their projects
    const admins = await User.find({
      role: { $in: [ROLES.SUPER_ADMIN, ROLES.ADMIN] },
      isActive: true,
    }).select('_id fullName email role');
    allowedRecipients.push(...admins);

    // Get project managers from projects assigned to this contractor
    const projects = await Project.find({ contractor: user._id }).select('projectManager');
    const pmIds = [...new Set(projects.map((p) => p.projectManager?.toString()).filter(Boolean))];
    if (pmIds.length > 0) {
      const projectManagers = await User.find({
        _id: { $in: pmIds },
        isActive: true,
      }).select('_id fullName email role');
      allowedRecipients.push(...projectManagers);
    }
  }

  return allowedRecipients;
};

// Get all conversations (inbox)
exports.getConversations = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { skip, limit: pageLimit } = paginate(page, limit);
    const userId = req.user._id;

    // Get all messages where user is sender or recipient
    const messages = await Message.find({
      $or: [{ sender: userId }, { 'recipients.recipient': userId }],
      isDeleted: false,
      $nor: [{ 'deletedBy.user': userId }], // Exclude messages deleted by this user
    })
      .populate('sender', 'fullName email role')
      .populate('recipients.recipient', 'fullName email role')
      .sort({ createdAt: -1 })
      .lean();

    // Group messages by conversation (threadId or unique sender-recipient combination)
    const conversationsMap = new Map();

    messages.forEach((message) => {
      const isSender = message.sender._id.toString() === userId.toString();
      let conversationKey;

      if (message.threadId) {
        conversationKey = message.threadId.toString();
      } else {
        // For new conversations, create key based on participants
        const participants = [message.sender._id.toString()];
        message.recipients.forEach((r) => participants.push(r.recipient._id.toString()));
        participants.sort();
        conversationKey = participants.join('-');
      }

      if (!conversationsMap.has(conversationKey)) {
        // Determine other participants
        const otherParticipants = isSender
          ? message.recipients.map((r) => r.recipient)
          : [message.sender, ...message.recipients.filter((r) => r.recipient._id.toString() !== userId.toString()).map((r) => r.recipient)];

        const unreadCount = isSender
          ? 0
          : message.recipients.find((r) => r.recipient._id.toString() === userId.toString())?.isRead === false
            ? 1
            : 0;

        conversationsMap.set(conversationKey, {
          _id: message._id,
          threadId: message.threadId || message._id,
          subject: message.subject,
          lastMessage: message.body,
          lastMessageAt: message.createdAt,
          participants: otherParticipants,
          unreadCount,
          isSender,
        });
      } else {
        const conv = conversationsMap.get(conversationKey);
        if (new Date(message.createdAt) > new Date(conv.lastMessageAt)) {
          conv.lastMessage = message.body;
          conv.lastMessageAt = message.createdAt;
          conv._id = message._id;
        }
        if (!isSender) {
          const recipient = message.recipients.find((r) => r.recipient._id.toString() === userId.toString());
          if (recipient && !recipient.isRead) {
            conv.unreadCount += 1;
          }
        }
      }
    });

    const conversations = Array.from(conversationsMap.values())
      .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      .slice(skip, skip + pageLimit);

    const total = conversationsMap.size;

    return successResponse(res, 200, 'Conversations retrieved successfully', {
      conversations,
      pagination: {
        page: parseInt(page),
        limit: pageLimit,
        total,
        totalPages: Math.ceil(total / pageLimit),
      },
    });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get messages in a conversation thread
exports.getConversationMessages = async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.user._id;

    // Get all messages in the thread
    const messages = await Message.find({
      $or: [{ _id: threadId }, { threadId }],
      isDeleted: false,
      $nor: [{ 'deletedBy.user': userId }],
      $and: [
        {
          $or: [{ sender: userId }, { 'recipients.recipient': userId }],
        },
      ],
    })
      .populate('sender', 'fullName email role')
      .populate('recipients.recipient', 'fullName email role')
      .sort({ createdAt: 1 })
      .lean();

    if (messages.length === 0) {
      return errorResponse(res, 404, 'Conversation not found');
    }

    // Mark messages as read for this user
    await Message.updateMany(
      {
        _id: { $in: messages.map((m) => m._id) },
        'recipients.recipient': userId,
        'recipients.isRead': false,
      },
      {
        $set: {
          'recipients.$.isRead': true,
          'recipients.$.readAt': new Date(),
        },
      }
    );

    return successResponse(res, 200, 'Messages retrieved successfully', { messages });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get allowed recipients for composing a message
exports.getAllowedRecipients = async (req, res) => {
  try {
    const allowedRecipients = await getAllowedRecipients(req.user);
    return successResponse(res, 200, 'Recipients retrieved successfully', { recipients: allowedRecipients });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Send a new message
exports.sendMessage = async (req, res) => {
  try {
    const { recipients, subject, body, threadId } = req.body;
    const senderId = req.user._id;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return errorResponse(res, 400, 'At least one recipient is required');
    }

    if (!subject || !subject.trim()) {
      return errorResponse(res, 400, 'Subject is required');
    }

    if (!body || !body.trim()) {
      return errorResponse(res, 400, 'Message body is required');
    }

    // Validate recipients are allowed
    const allowedRecipients = await getAllowedRecipients(req.user);
    const allowedRecipientIds = allowedRecipients.map((r) => r._id.toString());
    const invalidRecipients = recipients.filter((r) => !allowedRecipientIds.includes(r.toString()));

    if (invalidRecipients.length > 0) {
      return errorResponse(res, 403, 'You are not allowed to message one or more of the selected recipients');
    }

    // Ensure sender is not in recipients
    const uniqueRecipients = [...new Set(recipients.filter((r) => r.toString() !== senderId.toString()))];

    if (uniqueRecipients.length === 0) {
      return errorResponse(res, 400, 'You cannot send a message to yourself');
    }

    // Create message
    const messageData = {
      sender: senderId,
      recipients: uniqueRecipients.map((r) => ({
        recipient: r,
        isRead: false,
      })),
      subject: subject.trim(),
      body: body.trim(),
      threadId: threadId || null,
    };

    const message = await Message.create(messageData);
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'fullName email role')
      .populate('recipients.recipient', 'fullName email role');

    return successResponse(res, 201, 'Message sent successfully', populatedMessage);
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Mark conversation as read
exports.markAsRead = async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.user._id;

    await Message.updateMany(
      {
        $or: [{ _id: threadId }, { threadId }],
        'recipients.recipient': userId,
        'recipients.isRead': false,
      },
      {
        $set: {
          'recipients.$.isRead': true,
          'recipients.$.readAt': new Date(),
        },
      }
    );

    return successResponse(res, 200, 'Messages marked as read');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Delete a conversation (soft delete) - Only Super Admin can delete
exports.deleteConversation = async (req, res) => {
  try {
    // Only super admin can delete messages
    if (req.user.role !== ROLES.SUPER_ADMIN) {
      return errorResponse(res, 403, 'Only super administrators can delete messages');
    }

    const { threadId } = req.params;
    const userId = req.user._id;

    const messages = await Message.find({
      $or: [{ _id: threadId }, { threadId }],
      $and: [
        {
          $or: [{ sender: userId }, { 'recipients.recipient': userId }],
        },
      ],
    });

    if (messages.length === 0) {
      return errorResponse(res, 404, 'Conversation not found');
    }

    // Soft delete: add user to deletedBy array
    await Message.updateMany(
      {
        $or: [{ _id: threadId }, { threadId }],
      },
      {
        $push: {
          deletedBy: {
            user: userId,
            deletedAt: new Date(),
          },
        },
      }
    );

    return successResponse(res, 200, 'Conversation deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};

// Get unread message count
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;

    const count = await Message.countDocuments({
      'recipients.recipient': userId,
      'recipients.isRead': false,
      isDeleted: false,
      $nor: [{ 'deletedBy.user': userId }],
    });

    return successResponse(res, 200, 'Unread count retrieved successfully', { count });
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error.message);
  }
};
