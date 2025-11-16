const multer = require('multer');
const path = require('path');
const fs = require('fs');

const hasCloudinaryConfig = 
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET;

let storage;

if (hasCloudinaryConfig) {
  const cloudinary = require('cloudinary').v2;
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const ext = file.originalname.split('.').pop().toLowerCase();
      if (!['pdf', 'doc', 'docx'].includes(ext)) {
        throw new Error('Only PDF and DOC files are allowed');
      }
      return {
        folder: 'visa-applications',
        resource_type: 'raw',
        format: ext
      };
    },
  });

} else {
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });
}

const fileFilter = (req, file, cb) => {
  const allowedTypes = /pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (extname && mimetype) cb(null, true);
  else cb(new Error('Only PDF and DOC files are allowed'));
};

module.exports = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter
});
