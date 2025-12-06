const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const messagesController = require('../controllers/messages.controller');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validation');

// Get all conversations (inbox)
router.get('/conversations', authenticate, messagesController.getConversations);

// Get messages in a conversation thread
router.get('/conversations/:threadId/messages', authenticate, messagesController.getConversationMessages);

// Get allowed recipients for composing
router.get('/recipients', authenticate, messagesController.getAllowedRecipients);

// Send a new message
router.post(
  '/',
  authenticate,
  [
    body('recipients')
      .isArray({ min: 1 })
      .withMessage('At least one recipient is required')
      .custom((value) => {
        if (!Array.isArray(value) || value.length === 0) {
          throw new Error('Recipients must be a non-empty array');
        }
        return true;
      }),
    body('subject').trim().notEmpty().withMessage('Subject is required'),
    body('body').trim().notEmpty().withMessage('Message body is required'),
    body('threadId')
      .optional({ nullable: true, checkFalsy: true })
      .custom((value) => {
        if (value === null || value === undefined || value === '') {
          return true; // Allow null/undefined/empty for new messages
        }
        // If provided, must be a valid MongoDB ObjectId
        const mongoose = require('mongoose');
        return mongoose.Types.ObjectId.isValid(value);
      })
      .withMessage('Invalid thread ID'),
  ],
  validate,
  messagesController.sendMessage
);

// Mark conversation as read
router.patch('/conversations/:threadId/read', authenticate, messagesController.markAsRead);

// Delete a conversation
router.delete('/conversations/:threadId', authenticate, messagesController.deleteConversation);

// Get unread message count
router.get('/unread-count', authenticate, messagesController.getUnreadCount);

module.exports = router;
