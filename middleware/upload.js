// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');

// // Ensure uploads directory exists
// const uploadsDir = path.join(__dirname, '../uploads');
// if (!fs.existsSync(uploadsDir)) {
//   fs.mkdirSync(uploadsDir, { recursive: true });
// }

// // Configure multer storage
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadsDir);
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
//   }
// });

// // File filter
// const fileFilter = (req, file, cb) => {
//   // Accept PDF and common document formats
//   const allowedTypes = /pdf|doc|docx/;
//   const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
//   const mimetype = allowedTypes.test(file.mimetype);

//   if (extname && mimetype) {
//     return cb(null, true);
//   } else {
//     cb(new Error('Only PDF and DOC files are allowed'));
//   }
// };

// const upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: 10 * 1024 * 1024 // 10MB limit
//   },
//   fileFilter: fileFilter
// });

// module.exports = upload;



// for S3 bucket


// const multer = require("multer");
// const multerS3 = require("multer-s3");
// const { S3Client } = require("@aws-sdk/client-s3");
// const path = require("path");

// // AWS S3 Client
// const s3 = new S3Client({
//   region: process.env.AWS_REGION,
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   },
// });

// // Multer S3 storage
// const upload = multer({
//   storage: multerS3({
//     s3: s3,
//     bucket: process.env.AWS_BUCKET_NAME,
//     key: (req, file, cb) => {
//       const ext = path.extname(file.originalname);
//       const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
//       cb(null, `applications/${unique}${ext}`); // Folder inside bucket
//     },
//   }),
//   limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
// });

// module.exports = upload;



// for supabase storage 

// const multer = require("multer");
// const path = require("path");
// const { createClient } = require("@supabase/supabase-js");
// const fs = require("fs");

// // Create Supabase Client
// const supabase = createClient(
//   process.env.SUPABASE_URL,
//   process.env.SUPABASE_SERVICE_ROLE_KEY // IMPORTANT: Must be SERVICE_ROLE key
// );

// // Multer storing file temporarily
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, "uploads/"); // local temp folder
//   },
//   filename: function (req, file, cb) {
//     const ext = path.extname(file.originalname);
//     const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
//     cb(null, `application-${unique}${ext}`);
//   },
// });

// const uploadLocal = multer({ storage });

// // Middleware that uploads file to Supabase
// async function uploadToSupabase(req, res, next) {
//   if (!req.file) return next();

//   const filePath = req.file.path;
//   const fileExt = path.extname(req.file.originalname);
//   const fileName = `${Date.now()}-${Math.random()}${fileExt}`;
//   const supabasePath = `applications/${fileName}`;

//   const fileBuffer = fs.readFileSync(filePath);

//   // Upload to supabase bucket "visa-documents"
//   const { error: uploadError } = await supabase.storage
//     .from("visa-documents")
//     .upload(supabasePath, fileBuffer, {
//       upsert: false,
//       contentType: "application/pdf",
//     });

//   if (uploadError) {
//     return res.status(500).json({ error: "Failed to upload PDF to Supabase", details: uploadError });
//   }

//   // Get public URL
//   const { data: publicUrl } = supabase.storage
//     .from("visa-documents")
//     .getPublicUrl(supabasePath);

//   req.file.publicUrl = publicUrl.publicUrl;

//   // Delete temporary local file
//   fs.unlinkSync(filePath);

//   next();
// }

// module.exports = {
//   uploadLocal,
//   uploadToSupabase,
// };

const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

// Create Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Must be SERVICE_ROLE key
);

// Use memory storage
const storage = multer.memoryStorage();
const uploadMemory = multer({ storage });

// Middleware to upload file directly to Supabase
async function uploadToSupabase(req, res, next) {
  if (!req.file) return next();

  const fileBuffer = req.file.buffer; // File is already in memory
  const fileExt = req.file.originalname.split(".").pop();
  const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${fileExt}`;
  const supabasePath = `applications/${fileName}`;

  // Upload to Supabase bucket "visa-documents"
  const { error: uploadError } = await supabase.storage
    .from("visa-documents")
    .upload(supabasePath, fileBuffer, {
      upsert: false,
      contentType: req.file.mimetype, // dynamic content type
    });

  if (uploadError) {
    return res.status(500).json({ error: "Failed to upload PDF to Supabase", details: uploadError });
  }

  // Get public URL
  const { data: publicUrl } = supabase.storage
    .from("visa-documents")
    .getPublicUrl(supabasePath);

  req.file.publicUrl = publicUrl.publicUrl;

  next();
}

module.exports = {
  uploadMemory,
  uploadToSupabase,
};
