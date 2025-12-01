const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialize();
  }

  initialize() {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
      console.warn('⚠️ Email configuration missing. Email service disabled.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async sendEmail(to, subject, html, text = null) {
    if (!this.transporter) {
      console.warn('Email service not configured. Skipping email send.');
      return false;
    }

    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        html,
        text: text || subject,
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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hello ${user.fullName},</p>
        <p>You requested to reset your password. Click the button below to reset it:</p>
        <p><a href="${resetUrl}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Reset Password</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <p>Best regards,<br>Wells Management Team</p>
      </div>
    `;

    return await this.sendEmail(user.email, subject, html);
  }

  // Report submitted notification
  async sendReportSubmittedEmail(report, project, submitter) {
    const subject = `New Report Submitted - ${project.projectName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Report Submitted</h2>
        <p>A new report has been submitted for review:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Project:</strong> ${project.projectName}</p>
          <p><strong>Report:</strong> ${report.title}</p>
          <p><strong>Submitted by:</strong> ${submitter.fullName}</p>
          <p><strong>Date:</strong> ${new Date(report.submittedAt).toLocaleDateString()}</p>
        </div>
        <p><a href="${process.env.FRONTEND_URL}/reports/${report._id}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">View Report</a></p>
      </div>
    `;

    return html; // Return HTML for bulk sending
  }

  // Report approved notification
  async sendReportApprovedEmail(report, project, contractor) {
    const subject = `Report Approved - ${project.projectName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Report Approved</h2>
        <p>Hello ${contractor.fullName},</p>
        <p>Your report has been approved:</p>
        <div style="background: #f0fdf4; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #22c55e;">
          <p><strong>Project:</strong> ${project.projectName}</p>
          <p><strong>Report:</strong> ${report.title}</p>
          <p><strong>Status:</strong> Approved</p>
        </div>
        <p><a href="${process.env.FRONTEND_URL}/reports/${report._id}" style="background: #22c55e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">View Report</a></p>
      </div>
    `;

    return await this.sendEmail(contractor.email, subject, html);
  }

  // Report rejected notification
  async sendReportRejectedEmail(report, project, contractor, reason) {
    const subject = `Report Rejected - ${project.projectName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Report Rejected</h2>
        <p>Hello ${contractor.fullName},</p>
        <p>Your report has been rejected and requires revision:</p>
        <div style="background: #fef2f2; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ef4444;">
          <p><strong>Project:</strong> ${project.projectName}</p>
          <p><strong>Report:</strong> ${report.title}</p>
          <p><strong>Status:</strong> Rejected</p>
          <p><strong>Reason:</strong> ${reason}</p>
        </div>
        <p>Please revise and resubmit the report.</p>
        <p><a href="${process.env.FRONTEND_URL}/reports/${report._id}" style="background: #ef4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">View Report</a></p>
      </div>
    `;

    return await this.sendEmail(contractor.email, subject, html);
  }

  // Project assigned notification
  async sendProjectAssignedEmail(project, contractor) {
    const subject = `New Project Assigned - ${project.projectName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Project Assigned</h2>
        <p>Hello ${contractor.fullName},</p>
        <p>You have been assigned to a new project:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Project:</strong> ${project.projectName}</p>
          <p><strong>Location:</strong> ${project.city}, ${project.country}</p>
          <p><strong>Start Date:</strong> ${new Date(project.startDate).toLocaleDateString()}</p>
        </div>
        <p><a href="${process.env.FRONTEND_URL}/projects/${project._id}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">View Project</a></p>
      </div>
    `;

    return await this.sendEmail(contractor.email, subject, html);
  }
}

// Export singleton instance
module.exports = new EmailService();

