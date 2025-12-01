require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { ROLES } = require('./constants');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

const seed = async () => {
  try {
    await connectDB();

    // Create Super Admin
    const superAdminExists = await User.findOne({ role: ROLES.SUPER_ADMIN });
    if (!superAdminExists) {
      const superAdmin = await User.create({
        fullName: 'Super Admin',
        email: process.env.SUPER_ADMIN_EMAIL || 'admin@wells.com',
        password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@123456',
        role: ROLES.SUPER_ADMIN,
        isActive: true,
        language: 'en',
      });
      console.log('✅ Super Admin created:');
      console.log(`   Email: ${superAdmin.email}`);
      console.log(`   Password: ${process.env.SUPER_ADMIN_PASSWORD || 'Admin@123456'}`);
    } else {
      console.log('ℹ️  Super Admin already exists');
    }

    // Create default settings
    const defaultSettings = [
      {
        key: 'app_name',
        value: 'Wells Management System',
        category: 'general',
        description: 'Application name',
        isPublic: true,
      },
      {
        key: 'default_language',
        value: 'en',
        category: 'localization',
        description: 'Default language',
        isPublic: true,
      },
      {
        key: 'supported_languages',
        value: ['en', 'ar'],
        category: 'localization',
        description: 'Supported languages',
        isPublic: true,
      },
      {
        key: 'theme_settings',
        value: {
          primaryColor: '#2563eb',
          secondaryColor: '#10b981',
          mode: 'light',
        },
        category: 'theme',
        description: 'Theme configuration',
        isPublic: true,
      },
      {
        key: 'google_drive_enabled',
        value: false,
        category: 'google_drive',
        description: 'Google Drive integration status',
        isPublic: true,
      },
      {
        key: 'email_notifications_enabled',
        value: true,
        category: 'email',
        description: 'Email notifications status',
        isPublic: true,
      },
    ];

    for (const setting of defaultSettings) {
      await Settings.findOneAndUpdate(
        { key: setting.key },
        setting,
        { upsert: true, new: true }
      );
    }
    console.log('✅ Default settings created');

    console.log('\n🎉 Database seeded successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

seed();

