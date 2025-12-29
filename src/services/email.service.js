const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialize();
  }

  // Get logo attachment for emails
  getLogoAttachment() {
    const logoPath = path.join(__dirname, '../../public/logo512.png');
    try {
      if (fs.existsSync(logoPath)) {
        return {
          filename: 'logo.png',
          path: logoPath,
          cid: 'company-logo', // Content-ID for referencing in HTML
        };
      }
    } catch (error) {
      console.warn('Logo file not found, emails will be sent without logo');
    }
    return null;
  }

  // Get email header with logo
  getEmailHeader() {
    return `
      <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #e5e7eb; margin-bottom: 30px;">
        <img src="cid:company-logo" alt="Company Logo" style="max-width: 200px; height: auto;" />
      </div>
    `;
  }

  // Get email footer
  getEmailFooter() {
    return `
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
        <p>Best regards,<br><strong>Abar International Technology Contracting Company</strong></p>
        <p style="margin-top: 10px;">شركة آبار التقنية العالمية للمقاولات</p>
      </div>
    `;
  }

  initialize() {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
      console.warn('⚠️ Email configuration missing. Email service disabled.');
      return;
    }

    // Support both EMAIL_PASSWORD and EMAIL_PASS environment variables
    const emailPassword = process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS;

    if (!emailPassword) {
      console.warn('⚠️ Email password not configured. Email service disabled.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: emailPassword,
      },
      // Add requireTLS for port 587
      requireTLS: true,
      tls: {
        // Do not fail on invalid certificates
        rejectUnauthorized: false,
      },
    });
  }

  async sendEmail(to, subject, html, text = null, includeLogo = true) {
    if (!this.transporter) {
      console.warn('Email service not configured. Skipping email send.');
      return false;
    }

    try {
      const attachments = [];
      if (includeLogo) {
        const logoAttachment = this.getLogoAttachment();
        if (logoAttachment) {
          attachments.push(logoAttachment);
        }
      }

      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        html,
        text: text || subject,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('Email send error:', error);
      return false;
    }
  }

  // Welcome email
  async sendWelcomeEmail(user, temporaryPassword) {
    const subject = 'Welcome to Wells Management System';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Wells Management System</h2>
        <p>Hello ${user.fullName},</p>
        <p>Your account has been created successfully. Here are your login credentials:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Temporary Password:</strong> ${temporaryPassword}</p>
          <p><strong>Role:</strong> ${user.role}</p>
        </div>
        <p>Please login and change your password immediately.</p>
        <p><a href="${process.env.FRONTEND_URL}/login" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Login Now</a></p>
        <p>Best regards,<br>Wells Management Team</p>
      </div>
    `;

    return await this.sendEmail(user.email, subject, html);
  }

  // Password reset email
  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const subject = 'Password Reset Request';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${this.getEmailHeader()}
        <h2 style="color: #1f2937; margin-bottom: 20px;">Password Reset Request</h2>
        <p>Hello ${user.fullName},</p>
        <p>You requested to reset your password. Click the button below to reset it:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour.</p>
        <p style="color: #6b7280; font-size: 14px;">If you didn't request this, please ignore this email.</p>
        ${this.getEmailFooter()}
      </div>
    `;

    return await this.sendEmail(user.email, subject, html);
  }

  // Report submitted notification
  async sendReportSubmittedEmail(report, project, submitter) {
    const subject = `New Report Submitted - ${project.projectName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${this.getEmailHeader()}
        <h2 style="color: #1f2937; margin-bottom: 20px;">New Report Submitted</h2>
        <p>A new report has been submitted for review:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Project:</strong> ${project.projectName}</p>
          <p><strong>Report:</strong> ${report.title}</p>
          <p><strong>Submitted by:</strong> ${submitter.fullName}</p>
          <p><strong>Date:</strong> ${new Date(report.submittedAt).toLocaleDateString()}</p>
        </div>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/reports/${report._id}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View Report</a>
        </p>
        ${this.getEmailFooter()}
      </div>
    `;

    return html; // Return HTML for bulk sending
  }

  // Report approved notification
  async sendReportApprovedEmail(report, project, contractor) {
    const subject = `Report Approved - ${project.projectName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${this.getEmailHeader()}
        <h2 style="color: #1f2937; margin-bottom: 20px;">Report Approved</h2>
        <p>Hello ${contractor.fullName},</p>
        <p>Your report has been approved:</p>
        <div style="background: #f0fdf4; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #22c55e;">
          <p><strong>Project:</strong> ${project.projectName}</p>
          <p><strong>Report:</strong> ${report.title}</p>
          <p><strong>Status:</strong> Approved</p>
        </div>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/reports/${report._id}" style="background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View Report</a>
        </p>
        ${this.getEmailFooter()}
      </div>
    `;

    return await this.sendEmail(contractor.email, subject, html);
  }

  // Report rejected notification
  async sendReportRejectedEmail(report, project, contractor, reason) {
    const subject = `Report Rejected - ${project.projectName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${this.getEmailHeader()}
        <h2 style="color: #1f2937; margin-bottom: 20px;">Report Rejected</h2>
        <p>Hello ${contractor.fullName},</p>
        <p>Your report has been rejected and requires revision:</p>
        <div style="background: #fef2f2; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ef4444;">
          <p><strong>Project:</strong> ${project.projectName}</p>
          <p><strong>Report:</strong> ${report.title}</p>
          <p><strong>Status:</strong> Rejected</p>
          <p><strong>Reason:</strong> ${reason}</p>
        </div>
        <p>Please revise and resubmit the report.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/reports/${report._id}" style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View Report</a>
        </p>
        ${this.getEmailFooter()}
      </div>
    `;

    return await this.sendEmail(contractor.email, subject, html);
  }

  // Project assigned notification
  async sendProjectAssignedEmail(project, contractor) {
    const subject = `New Project Assigned - ${project.projectName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${this.getEmailHeader()}
        <h2 style="color: #1f2937; margin-bottom: 20px;">New Project Assigned</h2>
        <p>Hello ${contractor.fullName},</p>
        <p>You have been assigned to a new project:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Project:</strong> ${project.projectName}</p>
          <p><strong>Location:</strong> ${project.city}, ${project.country}</p>
          <p><strong>Start Date:</strong> ${new Date(project.startDate).toLocaleDateString()}</p>
        </div>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/projects/${project._id}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View Project</a>
        </p>
        ${this.getEmailFooter()}
      </div>
    `;

    return await this.sendEmail(contractor.email, subject, html);
  }

  // Send OTP email for client login
  async sendClientOTPEmail(email, otp, clientName = 'Client') {
    const subject = 'Your Login Verification Code';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${this.getEmailHeader()}
        <h2 style="color: #1f2937; margin-bottom: 20px;">Login Verification Code</h2>
        <p>Hello ${clientName},</p>
        <p>You requested to login to your client account. Use the verification code below:</p>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
          <h1 style="font-size: 32px; letter-spacing: 8px; color: #2563eb; margin: 0;">${otp}</h1>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This code will expire in 10 minutes.</p>
        <p style="color: #6b7280; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
        ${this.getEmailFooter()}
      </div>
    `;

    return await this.sendEmail(email, subject, html);
  }
}

// Export singleton instance
module.exports = new EmailService();

