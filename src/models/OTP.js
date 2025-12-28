const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // Auto-delete expired documents
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster lookups
otpSchema.index({ email: 1, expiresAt: 1 });

// Static method to generate OTP
otpSchema.statics.generateOTP = function () {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
};

// Instance method to verify OTP
otpSchema.methods.verify = function (inputOTP) {
  // Check if expired
  if (this.expiresAt < new Date()) {
    return { valid: false, error: 'OTP expired' };
  }

  // Check if max attempts exceeded
  if (this.attempts >= this.maxAttempts) {
    return { valid: false, error: 'Maximum verification attempts exceeded' };
  }

  // Increment attempts
  this.attempts += 1;

  // Verify OTP
  if (this.otp === inputOTP) {
    return { valid: true };
  }

  return { valid: false, error: 'Invalid OTP' };
};

module.exports = mongoose.model('OTP', otpSchema);
