const mongoose = require('mongoose');
const { PROJECT_STATUS } = require('../utils/constants');

const projectSchema = new mongoose.Schema(
  {
    projectNumber: {
      type: String,
      unique: true,
      required: true,
    },
    projectName: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
    },
    projectNameAr: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
    },
    descriptionAr: {
      type: String,
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
    },
    region: {
      type: String,
    },
    city: {
      type: String,
    },
    location: {
      latitude: Number,
      longitude: Number,
      address: String,
    },
    status: {
      type: String,
      enum: Object.values(PROJECT_STATUS),
      default: PROJECT_STATUS.PLANNED,
    },
    budget: {
      amount: {
        type: Number,
        min: 0,
      },
      currency: {
        type: String,
        default: 'USD',
      },
    },
    contractor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    projectManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    client: {
      name: String,
      email: String,
      phone: String,
    },
    startDate: {
      type: Date,
    },
    expectedEndDate: {
      type: Date,
    },
    actualEndDate: {
      type: Date,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    wellDetails: {
      depth: Number,
      diameter: Number,
      waterQuality: String,
      pumpType: String,
      capacity: Number, // liters per hour
    },
    beneficiaries: {
      estimatedFamilies: Number,
      estimatedPeople: Number,
    },
    googleDriveFolderId: {
      type: String,
    },
    googleDriveFolderUrl: {
      type: String,
    },
    tags: [String],
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notes: String,
    // Review fields
    reviewStatus: {
      type: String,
      enum: ['pending', 'reviewed', 'approved', 'needs_revision'],
      default: 'pending',
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
    // Evaluation fields
    evaluation: {
      overallScore: {
        type: Number,
        min: 0,
        max: 10,
      },
      qualityScore: {
        type: Number,
        min: 0,
        max: 10,
      },
      timelineScore: {
        type: Number,
        min: 0,
        max: 10,
      },
      budgetScore: {
        type: Number,
        min: 0,
        max: 10,
      },
      evaluatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      evaluatedAt: {
        type: Date,
      },
      evaluationNotes: {
        type: String,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate project number
projectSchema.pre('save', async function (next) {
  if (!this.projectNumber) {
    const count = await mongoose.model('Project').countDocuments();
    const year = new Date().getFullYear();
    this.projectNumber = `WP-${year}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Indexes for search and filtering
projectSchema.index({ projectNumber: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ country: 1 });
projectSchema.index({ contractor: 1 });
projectSchema.index({ projectManager: 1 });
projectSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Project', projectSchema);

