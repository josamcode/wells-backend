const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      // Get raw password from environment
      let emailPassword = process.env.EMAIL_PASSWORD || '';

      // Remove surrounding quotes if present (dotenv preserves quotes from .env file)
      // Handle both single and double quotes
      const trimmed = emailPassword.trim();
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        emailPassword = trimmed.slice(1, -1);
      }

      // Debug logging (only in development, remove sensitive data)
      if (process.env.NODE_ENV !== 'production') {
        console.log('📧 Email Configuration:');
        console.log('   Host:', process.env.EMAIL_HOST);
        console.log('   Port:', process.env.EMAIL_PORT);
        console.log('   User:', process.env.EMAIL_USER);
        console.log('   Password Length:', emailPassword.length);
        if (emailPassword.length > 0) {
          console.log('   Password Preview:', emailPassword.charAt(0) + '***' + emailPassword.charAt(emailPassword.length - 1));
        }
      }

      // Validate required environment variables
      if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !emailPassword) {
        console.warn('⚠️  Email configuration incomplete. Email service will not work.');
        console.warn('Required: EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD');
        return;
      }

      // Create transporter with proper Bluehost SMTP configuration
      const port = parseInt(process.env.EMAIL_PORT) || 587;
      const isSecure = port === 465;

      // Bluehost SMTP configuration with increased timeouts for better reliability
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: port,
        secure: isSecure, // true for 465 (SSL), false for 587 (STARTTLS)
        auth: {
          user: process.env.EMAIL_USER.trim(), // Ensure no whitespace
          pass: emailPassword, // Use password exactly as provided
        },
        tls: {
          // Don't reject unauthorized certificates in development
          rejectUnauthorized: process.env.NODE_ENV === 'production',
          // Use modern TLS settings
          minVersion: 'TLSv1.2',
        },
        // Additional options for Bluehost compatibility
        requireTLS: !isSecure, // Require TLS for non-SSL ports (587)
        // Increased timeouts for Bluehost (connection can be slower)
        connectionTimeout: 60000, // 60 seconds (increased from 20)
        greetingTimeout: 30000, // 30 seconds (increased from 10)
        socketTimeout: 300000, // 5 minutes (increased from 20 seconds)
        // Disable pipelining for better compatibility
        pool: false,
        // Debug mode in development
        debug: process.env.NODE_ENV !== 'production',
        logger: process.env.NODE_ENV !== 'production',
      });

      // Verify connection configuration (non-blocking, but log errors)
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('❌ Email transporter verification failed');
          console.error('Error:', error.message);
          console.error('Error Code:', error.code || 'N/A');
          console.error('\n📋 Troubleshooting steps:');
          console.error('1. Verify EMAIL_HOST is correct:');
          console.error('   - Try: smtp.bluehost.com (default)');
          console.error('   - Or: mail.abbarint.com (domain-specific)');
          console.error('2. Verify EMAIL_USER is your full email address (info@abbarint.com)');
          console.error('3. Verify EMAIL_PASSWORD is correct');
          console.error('4. If password has special characters, wrap it in quotes: EMAIL_PASSWORD="your-password"');
          console.error('5. Try different SMTP ports:');
          console.error('   - Port 465 with SSL (set EMAIL_PORT=465)');
          console.error('   - Port 587 with STARTTLS (set EMAIL_PORT=587)');
          console.error('6. Check if SMTP access is enabled in your Bluehost email account settings');
          console.error('7. Verify the email account is active and not suspended');
          console.error('8. Check firewall/network settings - ensure ports 465 and 587 are not blocked');
          console.error('9. If using a VPN or proxy, try disabling it temporarily\n');
        } else {
          console.log('✅ Email transporter is ready to send messages');
        }
      });
    } catch (error) {
      console.error('❌ Failed to initialize email transporter:', error.message);
    }
  }

  // Test email connection
  async testConnection() {
    if (!this.transporter) {
      throw new Error('Email transporter is not initialized');
    }

    try {
      await new Promise((resolve, reject) => {
        this.transporter.verify((error, success) => {
          if (error) {
            reject(error);
          } else {
            resolve(success);
          }
        });
      });
      return { success: true, message: 'Email connection successful' };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        code: error.code
      };
    }
  }

  // Base method to send email
  async sendEmail(to, subject, html, text = null) {
    if (!this.transporter) {
      // Try to reinitialize if transporter is null
      this.initializeTransporter();
      if (!this.transporter) {
        throw new Error('Email transporter is not initialized. Please check your email configuration in .env file.');
      }
    }

    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        html,
        text: text || this.htmlToText(html),
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Error sending email:', error.message);

      // Provide more helpful error messages
      if (error.code === 'EAUTH') {
        const errorMsg = 'Email authentication failed.\n' +
          'Possible solutions:\n' +
          '1. Verify EMAIL_USER is your full email address (e.g., info@abbarint.com)\n' +
          '2. Verify EMAIL_PASSWORD is correct\n' +
          '3. If password contains special characters, wrap it in quotes: EMAIL_PASSWORD="your-password"\n' +
          '4. Check if SMTP access is enabled in your Bluehost email account settings\n' +
          '5. Verify you are using the correct SMTP port (587 for STARTTLS or 465 for SSL)';
        throw new Error(errorMsg);
      } else if (error.code === 'ECONNECTION') {
        throw new Error('Could not connect to email server. Please check your EMAIL_HOST and EMAIL_PORT settings.');
      } else if (error.code === 'ETIMEDOUT') {
        throw new Error('Email server connection timed out. Please check your network connection and EMAIL_HOST setting.');
      } else {
        throw error;
      }
    }
  }

  // Helper method to convert HTML to plain text
  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  // Get logo URL (protected from downloading)
  getLogoUrl() {
    // Use backend URL to serve logo from backend's public folder
    const backendUrl = process.env.BACKEND_URL ||
      process.env.API_URL ||
      `http://localhost:${process.env.PORT || 5000}`;
    // Use logo512.png from backend's public folder
    const logoFile = 'logo512.png';
    const logoUrl = `${backendUrl}/${logoFile}`;
    return logoUrl;
  }

  // Professional email header with protected logo
  getEmailHeader() {
    const logoUrl = this.getLogoUrl();
    return `
      <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 0; margin: 0; border-radius: 8px 8px 0 0; overflow: hidden;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 0;">
          <tr>
            <td style="padding: 30px 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">Wells Management System</h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: rgba(255,255,255,0.9); font-weight: 400;">Professional Project Management</p>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  // Professional email footer
  getEmailFooter() {
    const currentYear = new Date().getFullYear();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return `
      <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #e5e7eb; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td style="padding: 0 20px 20px 20px; text-align: center;">
              <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                This is an automated email from <strong style="color: #2563eb;">Wells Management System</strong>.
              </p>
              <p style="margin: 0 0 12px 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                Please do not reply to this email. If you have any questions, please contact us through the system.
              </p>
              <div style="margin: 20px 0 15px 0; padding: 15px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
                <a href="${frontendUrl}" style="color: #2563eb; text-decoration: none; font-size: 13px; font-weight: 600;">Visit Our Platform</a>
                <span style="color: #d1d5db; margin: 0 12px;">•</span>
                <a href="${frontendUrl}/dashboard" style="color: #2563eb; text-decoration: none; font-size: 13px; font-weight: 600;">Go to Dashboard</a>
              </div>
              <p style="margin: 0; color: #9ca3af; font-size: 11px; line-height: 1.4;">
                &copy; ${currentYear} Wells Management System. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  // Professional email wrapper
  getEmailWrapper(content) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Wells Management System</title>
        <!--[if mso]>
        <style type="text/css">
          body, table, td {font-family: Arial, sans-serif !important;}
        </style>
        <![endif]-->
      </head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden;">
                <tr>
                  <td style="padding: 0;">
                    ${this.getEmailHeader()}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px 30px;">
                    ${content}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0;">
                    ${this.getEmailFooter()}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  // Professional button style
  getButtonStyle(color = '#2563eb', textColor = '#ffffff') {
    return `
      background: ${color};
      color: ${textColor};
      padding: 14px 32px;
      text-decoration: none;
      border-radius: 6px;
      display: inline-block;
      font-weight: 600;
      font-size: 15px;
      line-height: 1.5;
      text-align: center;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      transition: all 0.2s ease;
    `;
  }

  // Professional info box style
  getInfoBoxStyle(variant = 'default') {
    const styles = {
      default: 'background: #f8f9fa; border-left: 4px solid #2563eb;',
      success: 'background: #f0fdf4; border-left: 4px solid #22c55e;',
      warning: 'background: #fffbeb; border-left: 4px solid #f59e0b;',
      error: 'background: #fef2f2; border-left: 4px solid #ef4444;',
      info: 'background: #eff6ff; border-left: 4px solid #3b82f6;'
    };
    return styles[variant] || styles.default;
  }

  // Welcome email
  async sendWelcomeEmail(user, temporaryPassword) {
    const subject = 'Welcome to Wells Management System';
    const loginUrl = `${process.env.FRONTEND_URL}/login`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">Welcome to Wells Management System!</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${user.fullName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Your account has been created successfully. Here are your login credentials:</p>
        <div style="${this.getInfoBoxStyle('info')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding: 8px 0;">
                <p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Email:</strong> <span style="color: #2563eb; font-weight: 600;">${user.email}</span></p>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">
                <p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Temporary Password:</strong> <span style="color: #dc2626; font-weight: 600; font-family: 'Courier New', monospace; background: #fef2f2; padding: 4px 8px; border-radius: 4px;">${temporaryPassword}</span></p>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">
                <p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Role:</strong> <span style="color: #059669; font-weight: 600; text-transform: capitalize;">${user.role}</span></p>
              </td>
            </tr>
          </table>
        </div>
        <p style="margin: 25px 0 30px 0; font-size: 15px; line-height: 1.6; color: #dc2626; font-weight: 600;">⚠️ Please login and change your password immediately for security.</p>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${loginUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">Login Now</a>
        </div>
        <p style="margin: 30px 0 0 0; font-size: 15px; line-height: 1.6; color: #6b7280;">Best regards,<br><strong style="color: #111827;">Wells Management Team</strong></p>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(user.email, subject, html);
  }

  // Password reset email
  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const subject = 'Password Reset Request';
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">Password Reset Request</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${user.fullName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">You requested to reset your password. Click the button below to reset it:</p>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${resetUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">Reset Password</a>
        </div>
        <div style="${this.getInfoBoxStyle('warning')} padding: 16px; border-radius: 6px; margin: 25px 0;">
          <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #92400e;">
            <strong>⏰ This link will expire in 1 hour.</strong><br>
            If you didn't request this password reset, please ignore this email and your password will remain unchanged.
          </p>
        </div>
        <p style="margin: 25px 0 0 0; font-size: 14px; line-height: 1.6; color: #6b7280;">For security reasons, if you didn't request this reset, we recommend checking your account security settings.</p>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(user.email, subject, html);
  }

  // Report created notification (draft)
  async sendReportCreatedEmail(report, project, submitter) {
    const subject = `New Report Created - ${project.projectName}`;
    const reportUrl = `${process.env.FRONTEND_URL}/reports/${report._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">New Report Created</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">A new report has been created and requires your attention:</p>
        <div style="${this.getInfoBoxStyle('info')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Report:</strong> ${report.title}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Type:</strong> <span style="text-transform: capitalize;">${report.reportType}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Status:</strong> <span style="color: #f59e0b; font-weight: 600;">Draft</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Created by:</strong> ${submitter.fullName}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Date:</strong> ${new Date(report.createdAt).toLocaleDateString()}</p></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${reportUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">View Report</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return html; // Return HTML for bulk sending
  }

  // Report submitted notification
  async sendReportSubmittedEmail(report, project, submitter) {
    const subject = `New Report Submitted - ${project.projectName}`;
    const reportUrl = `${process.env.FRONTEND_URL}/reports/${report._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">📋 New Report Submitted</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">A new report has been submitted for review:</p>
        <div style="${this.getInfoBoxStyle('info')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Report:</strong> ${report.title}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Submitted by:</strong> ${submitter.fullName}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Date:</strong> ${new Date(report.submittedAt).toLocaleDateString()}</p></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${reportUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">Review Report</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return html; // Return HTML for bulk sending
  }

  // Report updated notification
  async sendReportUpdatedEmail(report, project, submitter, updatedBy) {
    const subject = `Report Updated - ${project.projectName}`;
    const reportUrl = `${process.env.FRONTEND_URL}/reports/${report._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">✏️ Report Updated</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">A report has been updated and requires your review:</p>
        <div style="${this.getInfoBoxStyle('warning')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Report:</strong> ${report.title}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Status:</strong> <span style="text-transform: capitalize; font-weight: 600;">${report.status}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Updated by:</strong> ${updatedBy.fullName}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Date:</strong> ${new Date().toLocaleDateString()}</p></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${reportUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">View Report</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return html; // Return HTML for bulk sending
  }

  // Report approved notification
  async sendReportApprovedEmail(report, project, contractor) {
    const subject = `Report Approved - ${project.projectName}`;
    const reportUrl = `${process.env.FRONTEND_URL}/reports/${report._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">✅ Report Approved</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${contractor.fullName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Great news! Your report has been approved:</p>
        <div style="${this.getInfoBoxStyle('success')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Report:</strong> ${report.title}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Status:</strong> <span style="color: #22c55e; font-weight: 700;">Approved ✓</span></p></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${reportUrl}" style="${this.getButtonStyle('#22c55e', '#ffffff')}">View Report</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(contractor.email, subject, html);
  }

  // Report rejected notification
  async sendReportRejectedEmail(report, project, contractor, reason) {
    const subject = `Report Rejected - ${project.projectName}`;
    const reportUrl = `${process.env.FRONTEND_URL}/reports/${report._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">❌ Report Rejected</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${contractor.fullName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Your report has been rejected and requires revision:</p>
        <div style="${this.getInfoBoxStyle('error')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Report:</strong> ${report.title}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Status:</strong> <span style="color: #ef4444; font-weight: 700;">Rejected</span></p></td></tr>
            <tr><td style="padding: 12px 0 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Reason:</strong></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 14px; color: #dc2626; background: #fef2f2; padding: 12px; border-radius: 4px; line-height: 1.5;">${reason}</p></td></tr>
          </table>
        </div>
        <p style="margin: 25px 0 30px 0; font-size: 15px; line-height: 1.6; color: #4b5563;">Please review the feedback above, make the necessary revisions, and resubmit the report.</p>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${reportUrl}" style="${this.getButtonStyle('#ef4444', '#ffffff')}">View Report & Revise</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(contractor.email, subject, html);
  }

  // Project assigned notification
  async sendProjectAssignedEmail(project, contractor) {
    const subject = `New Project Assigned - ${project.projectName}`;
    const projectUrl = `${process.env.FRONTEND_URL}/projects/${project._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">🎯 New Project Assigned</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${contractor.fullName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">You have been assigned to a new project. Here are the details:</p>
        <div style="${this.getInfoBoxStyle('info')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Location:</strong> ${project.city || ''}${project.city && project.country ? ', ' : ''}${project.country || ''}</p></td></tr>
            ${project.startDate ? `<tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Start Date:</strong> ${new Date(project.startDate).toLocaleDateString()}</p></td></tr>` : ''}
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${projectUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">View Project Details</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(contractor.email, subject, html);
  }

  // Send OTP email for client login
  async sendClientOTPEmail(email, otp, clientName = 'Client') {
    const subject = 'Your Login Verification Code';
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">🔐 Login Verification Code</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${clientName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">You requested to login to your client account. Use the verification code below:</p>
        <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 30px; border-radius: 8px; margin: 25px 0; text-align: center; border: 2px solid #3b82f6;">
          <h1 style="font-size: 42px; letter-spacing: 12px; color: #2563eb; margin: 0; font-weight: 700; font-family: 'Courier New', monospace; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">${otp}</h1>
        </div>
        <div style="${this.getInfoBoxStyle('warning')} padding: 16px; border-radius: 6px; margin: 25px 0;">
          <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #92400e;">
            <strong>⏰ This code will expire in 10 minutes.</strong><br>
            If you didn't request this code, please ignore this email and your account will remain secure.
          </p>
        </div>
        <p style="margin: 25px 0 0 0; font-size: 14px; line-height: 1.6; color: #6b7280;">For security reasons, never share this code with anyone.</p>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(email, subject, html);
  }

  // Project created notification
  async sendProjectCreatedEmail(project, creator) {
    const subject = `New Project Created - ${project.projectName}`;
    const projectUrl = `${process.env.FRONTEND_URL}/projects/${project._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">✨ New Project Created</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">A new project has been created in the system:</p>
        <div style="${this.getInfoBoxStyle('info')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project Number:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectNumber}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project Name:</strong> ${project.projectName}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Location:</strong> ${project.city || ''}${project.city && project.country ? ', ' : ''}${project.country || ''}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Status:</strong> <span style="text-transform: capitalize; font-weight: 600;">${project.status}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Created by:</strong> ${creator.fullName}</p></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${projectUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">View Project</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return html; // Return HTML for bulk sending
  }

  // Project status changed notification
  async sendProjectStatusChangedEmail(project, oldStatus, newStatus, changedBy) {
    const subject = `Project Status Updated - ${project.projectName}`;
    const projectUrl = `${process.env.FRONTEND_URL}/projects/${project._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">🔄 Project Status Updated</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">The project status has been changed:</p>
        <div style="${this.getInfoBoxStyle('info')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Previous Status:</strong> <span style="text-transform: capitalize;">${oldStatus}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">New Status:</strong> <span style="text-transform: capitalize; font-weight: 600; color: #059669;">${newStatus}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Changed by:</strong> ${changedBy.fullName}</p></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${projectUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">View Project</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(project.contractor?.email || project.projectManager?.email, subject, html);
  }

  // Project completed notification
  async sendProjectCompletedEmail(project, completedBy) {
    const subject = `Project Completed - ${project.projectName}`;
    const projectUrl = `${process.env.FRONTEND_URL}/projects/${project._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">🎉 Project Completed!</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Congratulations! A project has been successfully marked as completed:</p>
        <div style="${this.getInfoBoxStyle('success')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project Number:</strong> ${project.projectNumber}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Location:</strong> ${project.city || ''}${project.city && project.country ? ', ' : ''}${project.country || ''}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Progress:</strong> <span style="color: #22c55e; font-weight: 700;">${project.progress || 100}%</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Completed by:</strong> ${completedBy.fullName}</p></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${projectUrl}" style="${this.getButtonStyle('#22c55e', '#ffffff')}">View Project</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return html; // Return HTML for bulk sending
  }

  // Project archived/unarchived notification
  async sendProjectArchivedEmail(project, isArchived, actionBy) {
    const subject = `Project ${isArchived ? 'Archived' : 'Unarchived'} - ${project.projectName}`;
    const projectUrl = `${process.env.FRONTEND_URL}/projects/${project._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">📦 Project ${isArchived ? 'Archived' : 'Unarchived'}</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">The project has been ${isArchived ? 'archived' : 'unarchived'}:</p>
        <div style="${this.getInfoBoxStyle(isArchived ? 'warning' : 'info')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project Number:</strong> ${project.projectNumber}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Status:</strong> <span style="font-weight: 600;">${isArchived ? 'Archived' : 'Active'}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Action by:</strong> ${actionBy.fullName}</p></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${projectUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">View Project</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return html; // Return HTML for bulk sending
  }

  // Project manager assigned notification
  async sendProjectManagerAssignedEmail(project, projectManager) {
    const subject = `Project Manager Assignment - ${project.projectName}`;
    const projectUrl = `${process.env.FRONTEND_URL}/projects/${project._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">👔 Project Manager Assignment</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${projectManager.fullName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">You have been assigned as the project manager for the following project:</p>
        <div style="${this.getInfoBoxStyle('info')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Location:</strong> ${project.city || ''}${project.city && project.country ? ', ' : ''}${project.country || ''}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Status:</strong> <span style="text-transform: capitalize; font-weight: 600;">${project.status}</span></p></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${projectUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">View Project</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(projectManager.email, subject, html);
  }

  // User updated notification (role/status changes)
  async sendUserUpdatedEmail(user, updatedBy, changes = {}) {
    const subject = 'Your Account Has Been Updated';
    const profileUrl = `${process.env.FRONTEND_URL}/profile`;
    const changesList = Object.entries(changes)
      .map(([key, value]) => `<li style="margin: 8px 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">${key}:</strong> ${value}</li>`)
      .join('');
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">⚙️ Account Updated</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${user.fullName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Your account has been updated with the following changes:</p>
        <div style="${this.getInfoBoxStyle('info')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          ${changesList ? `<ul style="margin: 0; padding-left: 20px; list-style: none;">${changesList}</ul>` : '<p style="margin: 0; font-size: 15px; color: #374151;">Your account information has been modified.</p>'}
          <p style="margin: 15px 0 0 0; padding-top: 15px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;"><strong style="color: #111827;">Updated by:</strong> ${updatedBy.fullName}</p>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${profileUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">View Profile</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(user.email, subject, html);
  }

  // User activated/deactivated notification
  async sendUserStatusChangedEmail(user, isActive, changedBy) {
    const subject = `Account ${isActive ? 'Activated' : 'Deactivated'}`;
    const loginUrl = `${process.env.FRONTEND_URL}/login`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">${isActive ? '✅ Account Activated' : '❌ Account Deactivated'}</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${user.fullName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Your account has been ${isActive ? 'activated' : 'deactivated'}:</p>
        <div style="${this.getInfoBoxStyle(isActive ? 'success' : 'error')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Status:</strong> <span style="font-weight: 700; color: ${isActive ? '#22c55e' : '#ef4444'};}">${isActive ? 'Active' : 'Inactive'}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Changed by:</strong> ${changedBy.fullName}</p></td></tr>
            <tr><td style="padding: 12px 0 6px 0;"><p style="margin: 0; font-size: 14px; color: ${isActive ? '#059669' : '#dc2626'}; line-height: 1.5;">${!isActive ? '⚠️ You will not be able to access the system until your account is reactivated.' : '✅ You can now access the system with your credentials.'}</p></td></tr>
          </table>
        </div>
        ${isActive ? `
          <div style="text-align: center; margin: 35px 0;">
            <a href="${loginUrl}" style="${this.getButtonStyle('#22c55e', '#ffffff')}">Login Now</a>
          </div>
        ` : ''}
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(user.email, subject, html);
  }

  // Payment added notification
  async sendPaymentAddedEmail(payment, project, recipient) {
    const subject = `Payment Request - ${project.projectName}`;
    const projectUrl = `${process.env.FRONTEND_URL}/projects/${project._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">💰 Payment Request</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${recipient.fullName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">A new payment request has been created for the project:</p>
        <div style="${this.getInfoBoxStyle('info')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Amount:</strong> <span style="color: #059669; font-weight: 700; font-size: 16px;">${payment.amount} ${payment.currency}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Status:</strong> <span style="color: #f59e0b; font-weight: 600;">Pending Approval</span></p></td></tr>
            ${payment.description ? `<tr><td style="padding: 12px 0 6px 0;"><p style="margin: 0; font-size: 14px; color: #6b7280;"><strong style="color: #111827;">Description:</strong></p></td></tr><tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 14px; color: #4b5563; background: #f9fafb; padding: 10px; border-radius: 4px;">${payment.description}</p></td></tr>` : ''}
          </table>
        </div>
        <p style="margin: 25px 0 30px 0; font-size: 15px; line-height: 1.6; color: #4b5563;">Please review and approve or reject this payment request.</p>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${projectUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">View Project</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(recipient.email, subject, html);
  }

  // Payment approved notification
  async sendPaymentApprovedEmail(payment, project, requester, approver) {
    const subject = `Payment Approved - ${project.projectName}`;
    const projectUrl = `${process.env.FRONTEND_URL}/projects/${project._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">✅ Payment Approved</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${requester.fullName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Great news! Your payment request has been approved:</p>
        <div style="${this.getInfoBoxStyle('success')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Amount:</strong> <span style="color: #059669; font-weight: 700; font-size: 16px;">${payment.amount} ${payment.currency}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Approved by:</strong> ${approver.fullName}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Approval Date:</strong> ${new Date().toLocaleDateString()}</p></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${projectUrl}" style="${this.getButtonStyle('#22c55e', '#ffffff')}">View Project</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(requester.email, subject, html);
  }

  // Payment rejected notification
  async sendPaymentRejectedEmail(payment, project, requester, approver, reason) {
    const subject = `Payment Rejected - ${project.projectName}`;
    const projectUrl = `${process.env.FRONTEND_URL}/projects/${project._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">❌ Payment Rejected</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${requester.fullName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Your payment request has been rejected:</p>
        <div style="${this.getInfoBoxStyle('error')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Amount:</strong> <span style="color: #dc2626; font-weight: 700; font-size: 16px;">${payment.amount} ${payment.currency}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Rejected by:</strong> ${approver.fullName}</p></td></tr>
            ${reason ? `<tr><td style="padding: 12px 0 6px 0;"><p style="margin: 0; font-size: 14px; color: #6b7280;"><strong style="color: #111827;">Reason:</strong></p></td></tr><tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 14px; color: #dc2626; background: #fef2f2; padding: 10px; border-radius: 4px; line-height: 1.5;">${reason}</p></td></tr>` : ''}
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Rejection Date:</strong> ${new Date().toLocaleDateString()}</p></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${projectUrl}" style="${this.getButtonStyle('#ef4444', '#ffffff')}">View Project</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(requester.email, subject, html);
  }

  // Contract uploaded notification
  async sendContractUploadedEmail(project, uploadedBy, recipient) {
    const subject = `Contract Uploaded - ${project.projectName}`;
    const projectUrl = `${process.env.FRONTEND_URL}/projects/${project._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">📄 Contract Uploaded</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${recipient.fullName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">A contract has been uploaded for the project:</p>
        <div style="${this.getInfoBoxStyle('info')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Uploaded by:</strong> ${uploadedBy.fullName}</p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Date:</strong> ${new Date().toLocaleDateString()}</p></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${projectUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">View Project</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(recipient.email, subject, html);
  }

  // Project reviewed notification
  async sendProjectReviewedEmail(project, reviewer, recipient) {
    const subject = `Project Reviewed - ${project.projectName}`;
    const projectUrl = `${process.env.FRONTEND_URL}/projects/${project._id}`;
    const content = `
      <div style="color: #1f2937;">
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #111827; line-height: 1.3;">📋 Project Reviewed</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">Hello <strong>${recipient.fullName}</strong>,</p>
        <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">The project has been reviewed:</p>
        <div style="${this.getInfoBoxStyle('info')} padding: 20px; border-radius: 6px; margin: 25px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Project:</strong> <span style="color: #2563eb; font-weight: 600;">${project.projectName}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Review Status:</strong> <span style="text-transform: capitalize; font-weight: 600;">${project.reviewStatus}</span></p></td></tr>
            <tr><td style="padding: 6px 0;"><p style="margin: 0; font-size: 15px; color: #374151;"><strong style="color: #111827;">Reviewed by:</strong> ${reviewer.fullName}</p></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${projectUrl}" style="${this.getButtonStyle('#2563eb', '#ffffff')}">View Project</a>
        </div>
      </div>
    `;
    const html = this.getEmailWrapper(content);
    return await this.sendEmail(recipient.email, subject, html);
  }
}

// Export singleton instance
module.exports = new EmailService();
