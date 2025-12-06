const mongoose = require('mongoose');

const messageRecipientSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  readAt: {
    type: Date,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
});

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipients: [messageRecipientSchema],
    subject: {
      type: String,
      required: [true, 'Message subject is required'],
      trim: true,
    },
    body: {
      type: String,
      required: [true, 'Message body is required'],
      trim: true,
    },
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null, // null for new conversations, ObjectId for replies
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        deletedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ 'recipients.recipient': 1, createdAt: -1 });
messageSchema.index({ threadId: 1, createdAt: 1 });
messageSchema.index({ isDeleted: 1 });

// Virtual for conversation participants (sender + all recipients)
messageSchema.virtual('participants', {
  ref: 'User',
  localField: 'recipients.recipient',
  foreignField: '_id',
});

module.exports = mongoose.model('Message', messageSchema);
