const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Check if Cloudinary credentials are available
const hasCloudinaryConfig = 
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET;

let storage;

if (hasCloudinaryConfig) {
  // Use Cloudinary storage
  const cloudinary = require('cloudinary').v2;
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  // Configure Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  // Configure multer storage with Cloudinary
  storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let resource_type = 'raw'; // default to raw for documents
    const allowedFormats = ['pdf', 'doc', 'docx'];

    if (!allowedFormats.includes(file.mimetype.split('/')[1])) {
      throw new Error('Only PDF and DOC files are allowed');
    }

    return {
      folder: 'visa-applications',
      resource_type: 'raw', // <-- important for PDFs/DOCs
      format: file.originalname.split('.').pop(), // preserve extension
    };
  },
});

} else {
  // Fallback to local disk storage
  console.log('ℹ️  Cloudinary not configured. Files will be stored locally in the uploads folder.');
  
  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✓ Created uploads directory:', uploadsDir);
  }

  // Configure multer storage for local files
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });
}

// File filter
const fileFilter = (req, file, cb) => {
  // Accept PDF and common document formats
  const allowedTypes = /pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only PDF and DOC files are allowed'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: fileFilter
});

module.exports = upload;


