/**
 * Email Configuration Test Script
 * 
 * This script helps diagnose email configuration issues.
 * Run with: node test-email.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('='.repeat(60));
console.log('EMAIL CONFIGURATION DIAGNOSTIC TEST');
console.log('='.repeat(60));
console.log();

// Check environment variables
console.log('📋 Environment Variables:');
console.log('   EMAIL_HOST:', process.env.EMAIL_HOST || '❌ NOT SET');
console.log('   EMAIL_PORT:', process.env.EMAIL_PORT || '❌ NOT SET');
console.log('   EMAIL_USER:', process.env.EMAIL_USER || '❌ NOT SET');
console.log('   EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ?
  `✅ SET (Length: ${process.env.EMAIL_PASSWORD.length})` : '❌ NOT SET');
console.log('   EMAIL_FROM:', process.env.EMAIL_FROM || '❌ NOT SET');
console.log();

// Check password format
if (process.env.EMAIL_PASSWORD) {
  const password = process.env.EMAIL_PASSWORD;
  console.log('🔐 Password Analysis:');
  console.log('   Length:', password.length);
  console.log('   First char:', password.charAt(0));
  console.log('   Last char:', password.charAt(password.length - 1));
  console.log('   Has quotes:', password.startsWith('"') || password.startsWith("'"));
  console.log('   Contains special chars:', /[&<>~!@#$%^*()_+\-=\[\]{};':"\\|,.\/?]/.test(password));
  console.log();

  // Show password preview (safe)
  let preview = password;
  if (password.length > 4) {
    preview = password.charAt(0) + '*'.repeat(Math.min(password.length - 2, 10)) + password.charAt(password.length - 1);
  }
  console.log('   Preview:', preview);
  console.log();
}

// Test nodemailer connection
console.log('🔌 Testing Nodemailer Connection...');
console.log();

const nodemailer = require('nodemailer');

// Prepare password (remove quotes if present)
let emailPassword = process.env.EMAIL_PASSWORD || '';
const trimmed = emailPassword.trim();
if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
  (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
  emailPassword = trimmed.slice(1, -1);
}

const port = parseInt(process.env.EMAIL_PORT) || 587;
const isSecure = port === 465;

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: port,
  secure: isSecure, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER?.trim(),
    pass: emailPassword,
  },
  tls: {
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2',
  },
  requireTLS: !isSecure, // Require TLS for port 587
  // Increased timeouts for Bluehost
  connectionTimeout: 60000, // 60 seconds
  greetingTimeout: 30000, // 30 seconds
  socketTimeout: 300000, // 5 minutes
  debug: true,
  logger: true,
});

transporter.verify((error, success) => {
  console.log();
  if (error) {
    console.log('❌ CONNECTION FAILED');
    console.log('Error Code:', error.code);
    console.log('Error Message:', error.message);
    console.log();
    console.log('💡 SOLUTIONS:');
    console.log('1. Verify your .env file has the password wrapped in quotes:');
    console.log('   EMAIL_PASSWORD="9&>2qDf~"');
    console.log();
    console.log('2. Or try URL encoding special characters:');
    console.log('   EMAIL_PASSWORD=9%26%3E2qDf%7E');
    console.log('   (where & = %26, > = %3E, ~ = %7E)');
    console.log();
    console.log('3. Try different SMTP hosts:');
    console.log('   - smtp.bluehost.com (default)');
    console.log('   - mail.abbarint.com (domain-specific)');
    console.log('4. Try different SMTP ports:');
    console.log('   - Port 465 with SSL (set EMAIL_PORT=465)');
    console.log('   - Port 587 with STARTTLS (set EMAIL_PORT=587)');
    console.log('5. Verify SMTP is enabled in your Bluehost email account');
    console.log('6. Check if the email account is active');
    console.log('7. Check firewall/network settings - ensure ports 465 and 587 are not blocked');
    console.log('8. If using a VPN or proxy, try disabling it temporarily');
  } else {
    console.log('✅ CONNECTION SUCCESSFUL!');
    console.log('Your email configuration is working correctly.');
  }
  console.log();
  process.exit(error ? 1 : 0);
});
