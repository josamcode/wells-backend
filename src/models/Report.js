const mongoose = require('mongoose');
const { REPORT_STATUS, REPORT_TYPES } = require('../utils/constants');

const attachmentSchema = new mongoose.Schema({
  fileName: String,
  fileType: String,
  fileSize: Number,
  googleDriveFileId: String,
  googleDriveUrl: String,
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

const reportSchema = new mongoose.Schema(
  {
    reportNumber: {
      type: String,
      unique: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    reportType: {
      type: String,
      enum: Object.values(REPORT_TYPES),
      default: REPORT_TYPES.DAILY,
    },
    title: {
      type: String,
      required: [true, 'Report title is required'],
    },
    titleAr: {
      type: String,
    },
    description: {
      type: String,
    },
    descriptionAr: {
      type: String,
    },
    workCompleted: {
      type: String,
    },
    workCompletedAr: {
      type: String,
    },
    status: {
      type: String,
      enum: Object.values(REPORT_STATUS),
      default: REPORT_STATUS.DRAFT,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    submittedAt: {
      type: Date,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
    reviewNotes: {
      type: String,
    },
    rejectionReason: {
      type: String,
    },
    progressPercentage: {
      type: Number,
      min: 0,
      max: 100,
    },
    workDate: {
      type: Date,
      required: true,
    },
    laborers: {
      count: Number,
      names: [String],
    },
    equipment: [
      {
        name: String,
        quantity: Number,
        condition: String,
      },
    ],
    materials: [
      {
        name: String,
        quantity: Number,
        unit: String,
        cost: Number,
      },
    ],
    challenges: {
      type: String,
    },
    challengesAr: {
      type: String,
    },
    nextSteps: {
      type: String,
    },
    nextStepsAr: {
      type: String,
    },
    attachments: [attachmentSchema],
    weather: {
      condition: String,
      temperature: Number,
    },
    safetyIncidents: [
      {
        description: String,
        severity: String,
        actionTaken: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Auto-generate report number
reportSchema.pre('save', async function (next) {
  if (!this.reportNumber) {
    const count = await mongoose.model('Report').countDocuments();
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    this.reportNumber = `WR-${year}${month}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Indexes
reportSchema.index({ project: 1, createdAt: -1 });
reportSchema.index({ submittedBy: 1 });
reportSchema.index({ status: 1 });
reportSchema.index({ workDate: -1 });

module.exports = mongoose.model('Report', reportSchema);

