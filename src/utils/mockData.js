require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Project = require('../models/Project');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');
const { ROLES, PROJECT_STATUS, REPORT_STATUS, REPORT_TYPES, NOTIFICATION_TYPES } = require('./constants');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MongoDB URI not found in environment variables');
      console.error('   Please set MONGO_URI or MONGODB_URI in your .env file');
      process.exit(1);
    }
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

// Sample data arrays
const countries = ['Yemen', 'Sudan', 'Somalia', 'Syria', 'Iraq', 'Afghanistan', 'Pakistan', 'Bangladesh'];
const regions = ['North', 'South', 'East', 'West', 'Central'];
const cities = ['Capital', 'Port City', 'Mountain Town', 'Desert Village', 'Coastal Area'];
const organizations = ['UNICEF', 'Red Cross', 'Save the Children', 'Oxfam', 'World Vision', 'Mercy Corps'];
const firstNames = ['Ahmed', 'Mohammed', 'Ali', 'Hassan', 'Omar', 'Fatima', 'Aisha', 'Khadija', 'Maryam', 'Zainab'];
const lastNames = ['Al-Ahmad', 'Al-Mohammed', 'Al-Hassan', 'Al-Omar', 'Ibrahim', 'Hussein', 'Mahmoud', 'Salem', 'Nasser', 'Khalil'];

// Generate random date within range
const randomDate = (start, end) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

// Generate random number in range
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Generate random element from array
const randomElement = (array) => array[Math.floor(Math.random() * array.length)];

// Generate mock users
const generateUsers = async () => {
  console.log('\n📝 Generating Users...');

  const users = [];
  const roles = [ROLES.ADMIN, ROLES.PROJECT_MANAGER, ROLES.CONTRACTOR, ROLES.VIEWER];

  // Create users for each role (except super_admin which is created by seed.js)
  for (let i = 0; i < 15; i++) {
    const role = roles[i % roles.length];
    const firstName = randomElement(firstNames);
    const lastName = randomElement(lastNames);
    const fullName = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@wells.com`;

    const user = await User.create({
      fullName,
      email,
      password: 'Password123!',
      role,
      phone: `+1${randomInt(2000000000, 9999999999)}`,
      organization: randomElement(organizations),
      country: randomElement(countries),
      isActive: Math.random() > 0.1, // 90% active
      language: Math.random() > 0.5 ? 'en' : 'ar',
      lastLogin: Math.random() > 0.3 ? randomDate(new Date(2024, 0, 1), new Date()) : null,
    });

    users.push(user);
    console.log(`   ✅ Created ${role}: ${fullName} (${email})`);
  }

  return users;
};

// Generate mock projects
const generateProjects = async (users) => {
  console.log('\n📝 Generating Projects...');

  const projects = [];
  const contractors = users.filter(u => u.role === ROLES.CONTRACTOR);
  const projectManagers = users.filter(u => u.role === ROLES.PROJECT_MANAGER || u.role === ROLES.ADMIN);
  const admins = users.filter(u => u.role === ROLES.ADMIN || u.role === ROLES.SUPER_ADMIN);

  const statuses = Object.values(PROJECT_STATUS);
  const priorities = ['low', 'medium', 'high', 'urgent'];

  // Get current count for project number generation
  const existingCount = await Project.countDocuments();
  const year = new Date().getFullYear();

  for (let i = 0; i < 25; i++) {
    const status = randomElement(statuses);
    const country = randomElement(countries);
    const region = randomElement(regions);
    const city = randomElement(cities);

    const startDate = randomDate(new Date(2023, 0, 1), new Date());
    const expectedEndDate = new Date(startDate);
    expectedEndDate.setMonth(expectedEndDate.getMonth() + randomInt(3, 12));

    const actualEndDate = status === PROJECT_STATUS.COMPLETED
      ? randomDate(startDate, expectedEndDate)
      : null;

    const progress = status === PROJECT_STATUS.COMPLETED ? 100 :
      status === PROJECT_STATUS.IN_PROGRESS ? randomInt(10, 90) :
        status === PROJECT_STATUS.PLANNED ? 0 : randomInt(0, 100);

    // Generate project number manually
    const projectNumber = `WP-${year}-${String(existingCount + i + 1).padStart(5, '0')}`;

    const project = await Project.create({
      projectNumber,
      projectName: `Water Well Project ${i + 1} - ${city}, ${country}`,
      projectNameAr: `مشروع بئر ماء ${i + 1} - ${city}، ${country}`,
      description: `This project aims to provide clean drinking water to the community in ${city}, ${region}, ${country}. The well will serve approximately ${randomInt(50, 500)} families.`,
      descriptionAr: `يهدف هذا المشروع إلى توفير مياه الشرب النظيفة للمجتمع في ${city}، ${region}، ${country}. سوف يخدم البئر ما يقرب من ${randomInt(50, 500)} عائلة.`,
      country,
      region,
      city,
      location: {
        latitude: randomInt(-90, 90) + Math.random(),
        longitude: randomInt(-180, 180) + Math.random(),
        address: `${randomInt(1, 999)} Main Street, ${city}, ${country}`,
      },
      status,
      budget: {
        amount: randomInt(5000, 50000),
        currency: 'USD',
      },
      contractor: contractors.length > 0 ? randomElement(contractors)._id : null,
      projectManager: projectManagers.length > 0 ? randomElement(projectManagers)._id : null,
      donor: {
        name: randomElement(organizations),
        email: `donor${i}@example.com`,
        phone: `+1${randomInt(2000000000, 9999999999)}`,
      },
      startDate: status !== PROJECT_STATUS.PLANNED ? startDate : null,
      expectedEndDate,
      actualEndDate,
      progress,
      wellDetails: status !== PROJECT_STATUS.PLANNED ? {
        depth: randomInt(50, 200),
        diameter: randomInt(6, 12),
        waterQuality: randomElement(['Excellent', 'Good', 'Fair', 'Needs Treatment']),
        pumpType: randomElement(['Electric', 'Solar', 'Manual', 'Diesel']),
        capacity: randomInt(1000, 5000),
      } : undefined,
      beneficiaries: {
        estimatedFamilies: randomInt(50, 500),
        estimatedPeople: randomInt(300, 3000),
      },
      tags: [country, region, randomElement(['Urgent', 'High Priority', 'Community', 'Rural'])],
      priority: randomElement(priorities),
      isArchived: Math.random() > 0.85,
      createdBy: randomElement(admins)._id,
      notes: `Additional notes for project ${i + 1}. This project requires special attention due to ${randomElement(['remote location', 'difficult terrain', 'high demand', 'limited resources'])}.`,
    });

    projects.push(project);
    console.log(`   ✅ Created Project: ${project.projectName} (${status})`);
  }

  return projects;
};

// Generate mock reports
const generateReports = async (projects, users) => {
  console.log('\n📝 Generating Reports...');

  const reports = [];
  const contractors = users.filter(u => u.role === ROLES.CONTRACTOR);
  const projectManagers = users.filter(u => u.role === ROLES.PROJECT_MANAGER || u.role === ROLES.ADMIN);
  const reportTypes = Object.values(REPORT_TYPES);
  const reportStatuses = Object.values(REPORT_STATUS);

  // Generate reports for active projects
  const activeProjects = projects.filter(p =>
    p.status === PROJECT_STATUS.IN_PROGRESS ||
    p.status === PROJECT_STATUS.COMPLETED ||
    p.status === PROJECT_STATUS.ON_HOLD
  );

  for (let i = 0; i < 40; i++) {
    const project = randomElement(activeProjects);
    const contractor = project.contractor
      ? users.find(u => u._id.toString() === project.contractor.toString())
      : randomElement(contractors);

    if (!contractor) continue;

    const reportType = randomElement(reportTypes);
    const status = randomElement(reportStatuses);
    const workDate = randomDate(
      project.startDate || new Date(2024, 0, 1),
      project.actualEndDate || new Date()
    );

    const submittedAt = status !== REPORT_STATUS.DRAFT
      ? randomDate(workDate, new Date())
      : null;

    const reviewedBy = (status === REPORT_STATUS.APPROVED || status === REPORT_STATUS.REJECTED) && projectManagers.length > 0
      ? randomElement(projectManagers)._id
      : null;

    const reviewedAt = reviewedBy
      ? randomDate(submittedAt || workDate, new Date())
      : null;

    const report = await Report.create({
      project: project._id,
      reportType,
      title: `${reportType} Report - ${project.projectName}`,
      titleAr: `تقرير ${reportType} - ${project.projectNameAr}`,
      description: `This ${reportType.toLowerCase()} report covers the work completed on ${workDate.toLocaleDateString()}. Significant progress has been made on the well drilling.`,
      descriptionAr: `يغطي تقرير ${reportType} هذا العمل المكتمل في ${workDate.toLocaleDateString()}. تم إحراز تقدم كبير في حفر البئر.`,
      workCompleted: `Completed ${randomInt(5, 20)} meters of drilling. Installed casing for depth ${randomInt(10, 50)} meters.`,
      workCompletedAr: `اكتمل حفر ${randomInt(5, 20)} متر. تم تثبيت الغلاف لعمق ${randomInt(10, 50)} متر.`,
      status,
      submittedBy: contractor._id,
      submittedAt,
      reviewedBy,
      reviewedAt,
      reviewNotes: status === REPORT_STATUS.APPROVED
        ? 'Report approved. Good progress.'
        : status === REPORT_STATUS.REJECTED
          ? 'Report needs more details about the work completed.'
          : null,
      rejectionReason: status === REPORT_STATUS.REJECTED
        ? 'Insufficient information provided. Please add more details about materials used and challenges faced.'
        : null,
      progressPercentage: randomInt(0, 100),
      workDate,
      laborers: {
        count: randomInt(3, 15),
        names: Array.from({ length: randomInt(2, 5) }, (_, i) =>
          `${randomElement(firstNames)} ${randomElement(lastNames)}`
        ),
      },
      equipment: [
        { name: 'Drilling Rig', quantity: 1, condition: 'Good' },
        { name: 'Water Pump', quantity: randomInt(1, 3), condition: randomElement(['Excellent', 'Good', 'Fair']) },
        { name: 'Generator', quantity: 1, condition: 'Good' },
      ],
      materials: [
        { name: 'Cement', quantity: randomInt(10, 50), unit: 'bags', cost: randomInt(100, 500) },
        { name: 'Steel Casing', quantity: randomInt(20, 100), unit: 'meters', cost: randomInt(500, 2000) },
        { name: 'Gravel', quantity: randomInt(5, 20), unit: 'tons', cost: randomInt(200, 800) },
      ],
      challenges: Math.random() > 0.5 ? `Faced ${randomElement(['rocky terrain', 'water shortage', 'equipment breakdown', 'weather delays'])}. Resolved by ${randomElement(['using alternative methods', 'bringing additional equipment', 'waiting for better conditions'])}.` : null,
      challengesAr: Math.random() > 0.5 ? `واجهنا ${randomElement(['أرض صخرية', 'نقص المياه', 'عطل في المعدات', 'تأخيرات الطقس'])}. تم الحل من خلال ${randomElement(['استخدام طرق بديلة', 'جلب معدات إضافية', 'انتظار ظروف أفضل'])}.` : null,
      nextSteps: `Continue drilling to target depth. Install pump system. Test water quality.`,
      nextStepsAr: `متابعة الحفر حتى العمق المستهدف. تثبيت نظام المضخة. اختبار جودة المياه.`,
      attachments: Math.random() > 0.3 ? [
        {
          fileName: `report_${i + 1}_photo1.jpg`,
          fileType: 'image/jpeg',
          fileSize: randomInt(500000, 5000000),
          uploadedAt: workDate,
        },
        {
          fileName: `report_${i + 1}_document.pdf`,
          fileType: 'application/pdf',
          fileSize: randomInt(100000, 2000000),
          uploadedAt: workDate,
        },
      ] : [],
      weather: {
        condition: randomElement(['Sunny', 'Cloudy', 'Rainy', 'Windy', 'Hot']),
        temperature: randomInt(20, 45),
      },
      safetyIncidents: Math.random() > 0.8 ? [
        {
          description: 'Minor equipment issue. No injuries.',
          severity: 'low',
          actionTaken: 'Equipment repaired immediately.',
        },
      ] : [],
    });

    reports.push(report);
    console.log(`   ✅ Created Report: ${report.title} (${status})`);
  }

  return reports;
};

// Generate mock notifications
const generateNotifications = async (users, projects, reports) => {
  console.log('\n📝 Generating Notifications...');

  const notifications = [];
  const notificationTypes = Object.values(NOTIFICATION_TYPES);
  const priorities = ['low', 'medium', 'high'];

  // Get super admin to create some notifications for them too
  const superAdmin = await User.findOne({ role: ROLES.SUPER_ADMIN });

  // Create some notifications for super admin
  if (superAdmin) {
    for (let i = 0; i < 5; i++) {
      const notification = await Notification.create({
        recipient: superAdmin._id,
        type: randomElement(notificationTypes),
        title: {
          en: `System Notification ${i + 1}`,
          ar: `إشعار النظام ${i + 1}`,
        },
        message: {
          en: `This is a system notification for the super admin. Notification number ${i + 1}.`,
          ar: `هذا إشعار نظام للمدير العام. رقم الإشعار ${i + 1}.`,
        },
        isRead: Math.random() > 0.5,
        readAt: Math.random() > 0.5 ? randomDate(new Date(2024, 0, 1), new Date()) : null,
        relatedEntity: {
          entityType: 'system',
        },
        priority: randomElement(priorities),
      });
      notifications.push(notification);
    }
    console.log(`   ✅ Created ${5} notifications for Super Admin`);
  }

  // Project assigned notifications
  for (const project of projects.slice(0, 10)) {
    if (project.contractor) {
      const notification = await Notification.create({
        recipient: project.contractor,
        type: NOTIFICATION_TYPES.PROJECT_ASSIGNED,
        title: {
          en: `New Project Assigned: ${project.projectName}`,
          ar: `مشروع جديد معين: ${project.projectNameAr}`,
        },
        message: {
          en: `You have been assigned to project ${project.projectNumber}. Please review the project details and start planning.`,
          ar: `تم تعيينك في المشروع ${project.projectNumber}. يرجى مراجعة تفاصيل المشروع والبدء في التخطيط.`,
        },
        isRead: Math.random() > 0.5,
        readAt: Math.random() > 0.5 ? randomDate(new Date(2024, 0, 1), new Date()) : null,
        relatedEntity: {
          entityType: 'project',
          entityId: project._id,
        },
        actionUrl: `/projects/${project._id}`,
        priority: randomElement(priorities),
      });
      notifications.push(notification);
    }
  }

  // Report submitted notifications
  for (const report of reports.filter(r => r.status === REPORT_STATUS.SUBMITTED || r.status === REPORT_STATUS.APPROVED)) {
    const project = projects.find(p => p._id.toString() === report.project.toString());
    if (project && project.projectManager) {
      const notification = await Notification.create({
        recipient: project.projectManager,
        type: NOTIFICATION_TYPES.REPORT_SUBMITTED,
        title: {
          en: `New Report Submitted: ${report.title}`,
          ar: `تقرير جديد مقدم: ${report.titleAr}`,
        },
        message: {
          en: `A ${report.reportType} report has been submitted for project ${project.projectNumber}. Please review.`,
          ar: `تم تقديم تقرير ${report.reportType} للمشروع ${project.projectNumber}. يرجى المراجعة.`,
        },
        isRead: Math.random() > 0.4,
        readAt: Math.random() > 0.4 ? randomDate(report.submittedAt || new Date(), new Date()) : null,
        relatedEntity: {
          entityType: 'report',
          entityId: report._id,
        },
        actionUrl: `/reports/${report._id}`,
        priority: 'medium',
      });
      notifications.push(notification);
    }
  }

  // Report approved/rejected notifications
  for (const report of reports.filter(r => r.status === REPORT_STATUS.APPROVED || r.status === REPORT_STATUS.REJECTED)) {
    if (report.reviewedBy) {
      const notification = await Notification.create({
        recipient: report.submittedBy,
        type: report.status === REPORT_STATUS.APPROVED
          ? NOTIFICATION_TYPES.REPORT_APPROVED
          : NOTIFICATION_TYPES.REPORT_REJECTED,
        title: {
          en: `Report ${report.status === REPORT_STATUS.APPROVED ? 'Approved' : 'Rejected'}: ${report.title}`,
          ar: `تقرير ${report.status === REPORT_STATUS.APPROVED ? 'موافق عليه' : 'مرفوض'}: ${report.titleAr}`,
        },
        message: {
          en: `Your ${report.reportType} report has been ${report.status === REPORT_STATUS.APPROVED ? 'approved' : 'rejected'}.`,
          ar: `تم ${report.status === REPORT_STATUS.APPROVED ? 'الموافقة على' : 'رفض'} تقرير ${report.reportType} الخاص بك.`,
        },
        isRead: Math.random() > 0.3,
        readAt: Math.random() > 0.3 ? randomDate(report.reviewedAt || new Date(), new Date()) : null,
        relatedEntity: {
          entityType: 'report',
          entityId: report._id,
        },
        actionUrl: `/reports/${report._id}`,
        priority: 'medium',
      });
      notifications.push(notification);
    }
  }

  // Project status changed notifications
  for (const project of projects.filter(p => p.status === PROJECT_STATUS.COMPLETED || p.status === PROJECT_STATUS.ON_HOLD)) {
    const recipients = [project.contractor, project.projectManager].filter(Boolean);
    for (const recipient of recipients) {
      const notification = await Notification.create({
        recipient,
        type: NOTIFICATION_TYPES.PROJECT_STATUS_CHANGED,
        title: {
          en: `Project Status Changed: ${project.projectName}`,
          ar: `تغيير حالة المشروع: ${project.projectNameAr}`,
        },
        message: {
          en: `Project ${project.projectNumber} status has been changed to ${project.status}.`,
          ar: `تم تغيير حالة المشروع ${project.projectNumber} إلى ${project.status}.`,
        },
        isRead: Math.random() > 0.4,
        readAt: Math.random() > 0.4 ? randomDate(project.updatedAt || new Date(), new Date()) : null,
        relatedEntity: {
          entityType: 'project',
          entityId: project._id,
        },
        actionUrl: `/projects/${project._id}`,
        priority: 'medium',
      });
      notifications.push(notification);
    }
  }

  console.log(`   ✅ Created ${notifications.length} notifications`);
  return notifications;
};

// Generate mock audit logs
const generateAuditLogs = async (users, projects, reports) => {
  console.log('\n📝 Generating Audit Logs...');

  const auditLogs = [];
  const actions = [
    'CREATE_PROJECT', 'UPDATE_PROJECT', 'DELETE_PROJECT',
    'CREATE_REPORT', 'UPDATE_REPORT', 'SUBMIT_REPORT', 'APPROVE_REPORT', 'REJECT_REPORT',
    'CREATE_USER', 'UPDATE_USER', 'DELETE_USER',
    'LOGIN', 'LOGOUT', 'CHANGE_PASSWORD',
    'UPDATE_SETTINGS', 'CONNECT_GOOGLE_DRIVE',
  ];

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
  ];

  for (let i = 0; i < 100; i++) {
    const user = randomElement(users);
    const action = randomElement(actions);
    let entityType = 'system';
    let entityId = null;
    let changes = null;

    if (action.includes('PROJECT')) {
      entityType = 'project';
      entityId = projects.length > 0 ? randomElement(projects)._id : null;
      changes = { status: randomElement(Object.values(PROJECT_STATUS)) };
    } else if (action.includes('REPORT')) {
      entityType = 'report';
      entityId = reports.length > 0 ? randomElement(reports)._id : null;
      changes = { status: randomElement(Object.values(REPORT_STATUS)) };
    } else if (action.includes('USER')) {
      entityType = 'user';
      entityId = users.length > 0 ? randomElement(users)._id : null;
      changes = { isActive: Math.random() > 0.5 };
    }

    const auditLog = await AuditLog.create({
      user: user._id,
      action,
      entityType,
      entityId,
      changes,
      ipAddress: `${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`,
      userAgent: randomElement(userAgents),
      success: Math.random() > 0.05, // 95% success rate
      errorMessage: Math.random() > 0.95 ? 'Permission denied' : null,
      createdAt: randomDate(new Date(2024, 0, 1), new Date()),
    });

    auditLogs.push(auditLog);
  }

  console.log(`   ✅ Created ${auditLogs.length} audit logs`);
  return auditLogs;
};

// Main function
const generateMockData = async () => {
  let createdUsers = [];
  let createdProjects = [];
  let createdReports = [];
  let createdNotifications = [];
  let createdAuditLogs = [];

  try {
    await connectDB();

    console.log('\n🚀 Starting Mock Data Generation...\n');

    // Clear existing data (optional - comment out if you want to keep existing data)
    const clearData = process.argv.includes('--clear');
    if (clearData) {
      console.log('🗑️  Clearing existing data...');
      await User.deleteMany({ role: { $ne: ROLES.SUPER_ADMIN } });
      await Project.deleteMany({});
      await Report.deleteMany({});
      await Notification.deleteMany({});
      await AuditLog.deleteMany({});
      console.log('✅ Existing data cleared\n');
    }

    // Generate data
    createdUsers = await generateUsers();
    createdProjects = await generateProjects(createdUsers);
    createdReports = await generateReports(createdProjects, createdUsers);
    createdNotifications = await generateNotifications(createdUsers, createdProjects, createdReports);
    createdAuditLogs = await generateAuditLogs(createdUsers, createdProjects, createdReports);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 MOCK DATA GENERATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Users: ${createdUsers.length}`);
    console.log(`✅ Projects: ${createdProjects.length}`);
    console.log(`✅ Reports: ${createdReports.length}`);
    console.log(`✅ Notifications: ${createdNotifications.length}`);
    console.log(`✅ Audit Logs: ${createdAuditLogs.length}`);
    console.log('='.repeat(50));
    console.log('\n🎉 Mock data generation completed successfully!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Mock data generation error:', error);

    // Cleanup: Delete partially created data
    console.log('\n🧹 Cleaning up partially created data...');
    try {
      if (createdAuditLogs.length > 0) {
        await AuditLog.deleteMany({ _id: { $in: createdAuditLogs.map(a => a._id) } });
        console.log('   ✅ Deleted audit logs');
      }
      if (createdNotifications.length > 0) {
        await Notification.deleteMany({ _id: { $in: createdNotifications.map(n => n._id) } });
        console.log('   ✅ Deleted notifications');
      }
      if (createdReports.length > 0) {
        await Report.deleteMany({ _id: { $in: createdReports.map(r => r._id) } });
        console.log('   ✅ Deleted reports');
      }
      if (createdProjects.length > 0) {
        await Project.deleteMany({ _id: { $in: createdProjects.map(p => p._id) } });
        console.log('   ✅ Deleted projects');
      }
      if (createdUsers.length > 0) {
        await User.deleteMany({ _id: { $in: createdUsers.map(u => u._id) } });
        console.log('   ✅ Deleted users');
      }
      console.log('✅ Cleanup completed\n');
    } catch (cleanupError) {
      console.error('❌ Cleanup error:', cleanupError);
    }

    process.exit(1);
  }
};

// Cleanup function to delete all non-super-admin users
const cleanupUsers = async () => {
  try {
    await connectDB();
    console.log('\n🧹 Cleaning up users (keeping super admin)...');
    const result = await User.deleteMany({ role: { $ne: ROLES.SUPER_ADMIN } });
    console.log(`✅ Deleted ${result.deletedCount} users\n`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  if (process.argv.includes('--cleanup-users')) {
    cleanupUsers();
  } else {
    generateMockData();
  }
}

module.exports = { generateMockData, cleanupUsers };

