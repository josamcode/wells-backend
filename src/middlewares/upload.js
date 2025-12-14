const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { errorResponse } = require('../utils/helpers');

// Memory storage for Cloudinary uploads
const memoryStorage = multer.memoryStorage();

// Disk storage for temporary file uploads
const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/temp');
  },
  filename: function (req, file, cb) {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const defaultAllowedTypes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  const envAllowedTypes = process.env.ALLOWED_FILE_TYPES
    ? process.env.ALLOWED_FILE_TYPES.split(',').map(t => t.trim()).filter(t => t)
    : [];

  const allowedTypes = envAllowedTypes.length > 0 ? envAllowedTypes : defaultAllowedTypes;

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`), false);
  }
};

// Create multer upload instance (disk storage - for existing functionality)
const upload = multer({
  storage: diskStorage,
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE) || 50) * 1024 * 1024, // Convert MB to bytes
  },
  fileFilter: fileFilter,
});

// Memory storage upload for Cloudinary
const uploadMemory = multer({
  storage: memoryStorage,
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE) || 50) * 1024 * 1024,
  },
  fileFilter: fileFilter,
});

// Error handling middleware for multer
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return errorResponse(res, 400, 'File size too large');
    }
    return errorResponse(res, 400, err.message);
  } else if (err) {
    return errorResponse(res, 400, err.message);
  }
  next();
};

module.exports = { upload, uploadMemory, handleUploadError };
