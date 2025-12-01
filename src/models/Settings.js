const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      required: true,
    },
    category: {
      type: String,
      enum: ['general', 'theme', 'email', 'google_drive', 'localization'],
      default: 'general',
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
settingsSchema.index({ key: 1 });
settingsSchema.index({ category: 1 });

module.exports = mongoose.model('Settings', settingsSchema);

