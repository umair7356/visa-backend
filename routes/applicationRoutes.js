const express = require('express');
const router = express.Router();
const Application = require('../models/Application');
const upload = require('../middleware/upload');
const authMiddleware = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Conditionally require cloudinary only if credentials are available
let cloudinary = null;
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary = require('cloudinary').v2;
}

// ==================== PUBLIC ROUTES (MUST BE FIRST) ====================

// Public route - Check visa status
router.post('/check-status', [
  body('applicationId').notEmpty().withMessage('Application ID is required'),
  body('passportNumber').notEmpty().withMessage('Passport Number is required'),
  body('dob').notEmpty().withMessage('Date of Birth is required'),
  body('nationality').notEmpty().withMessage('Nationality is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { applicationId, passportNumber, dob, nationality } = req.body;

    // Convert dob to date and normalize for comparison
    const dobDate = new Date(dob);
    const startOfDay = new Date(dobDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dobDate);
    endOfDay.setHours(23, 59, 59, 999);

    const application = await Application.findOne({
      applicationId: applicationId,
      passportNumber: passportNumber,
      nationality: nationality,
      dob: { $gte: startOfDay, $lte: endOfDay }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(application);
  } catch (error) {
    console.error('Check status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// NEW: Public route for downloading documents (different path to avoid conflicts)
// router.get('/download/:id', async (req, res) => {
//   try {
//     console.log('[PUBLIC DOWNLOAD] Requested ID:', req.params.id);

//     const application = await Application.findById(req.params.id);
//     if (!application) {
//       console.log('[PUBLIC DOWNLOAD] Application not found');
//       return res.status(404).json({ error: 'Application not found' });
//     }

//     console.log('[PUBLIC DOWNLOAD] Found application:', {
//       id: application._id,
//       applicationId: application.applicationId,
//       hasDocumentFilePath: !!application.documentFilePath,
//       hasDocumentUrl: !!application.documentUrl
//     });

//     // Get document URL
//     let documentUrl = application.documentFilePath || application.documentUrl;

//     console.log('[PUBLIC DOWNLOAD] Document URL:', documentUrl);

//     if (!documentUrl) {
//       return res.status(404).json({ error: 'Document not found' });
//     }

//     // If it's a Cloudinary URL, fetch and stream
//     if (documentUrl.startsWith('http://') || documentUrl.startsWith('https://')) {
//       console.log('[PUBLIC DOWNLOAD] Fetching from Cloudinary');

//       try {
//         const https = require('https');
//         const http = require('http');

//         const client = documentUrl.startsWith('https://') ? https : http;

//         const fileRequest = client.get(documentUrl, (fileResponse) => {
//           console.log('[PUBLIC DOWNLOAD] Cloudinary response:', fileResponse.statusCode);

//           // Handle redirects
//           if (fileResponse.statusCode === 301 || fileResponse.statusCode === 302) {
//             const redirectUrl = fileResponse.headers.location;
//             if (redirectUrl) {
//               return res.redirect(redirectUrl);
//             }
//           }

//           // Handle success
//           if (fileResponse.statusCode === 200) {
//             res.setHeader('Content-Type', fileResponse.headers['content-type'] || 'application/pdf');
//             res.setHeader('Content-Disposition', `attachment; filename="visa-document-${application.applicationId}.pdf"`);
//             res.setHeader('Access-Control-Allow-Origin', '*');

//             fileResponse.pipe(res);
//           } else {
//             return res.status(fileResponse.statusCode).json({ error: 'Failed to fetch document' });
//           }
//         });

//         fileRequest.on('error', (error) => {
//           console.error('[PUBLIC DOWNLOAD] Fetch error:', error);
//           return res.status(500).json({ error: 'Failed to fetch document' });
//         });

//         fileRequest.end();
//       } catch (error) {
//         console.error('[PUBLIC DOWNLOAD] Processing error:', error);
//         return res.status(500).json({ error: 'Failed to process document URL' });
//       }
//       return;
//     }

//     // Fallback for local files
//     if (fs.existsSync(documentUrl)) {
//       return res.download(documentUrl);
//     }

//     return res.status(404).json({ error: 'Document not found' });
//   } catch (error) {
//     console.error('[PUBLIC DOWNLOAD] Error:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

router.get('/download/:id', async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const documentUrl = application.documentFilePath || application.documentUrl;
    if (!documentUrl) return res.status(404).json({ error: 'Document not found' });

    // Cloudinary URL
    if (documentUrl.startsWith('http://') || documentUrl.startsWith('https://')) {
      const client = documentUrl.startsWith('https://') ? https : http;
      client.get(documentUrl, fileRes => {
        if (fileRes.statusCode === 200) {
          res.setHeader('Content-Type', fileRes.headers['content-type'] || 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="document-${application.applicationId}.pdf"`);
          fileRes.pipe(res);
        } else if (fileRes.statusCode === 301 || fileRes.statusCode === 302) {
          res.redirect(fileRes.headers.location);
        } else {
          res.status(fileRes.statusCode).json({ error: 'Failed to fetch document' });
        }
      }).on('error', err => res.status(500).json({ error: 'Failed to fetch document' }));
      return;
    }

    // Local file
    if (fs.existsSync(documentUrl)) return res.download(documentUrl);

    return res.status(404).json({ error: 'Document not found' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});
// ==================== PROTECTED ROUTES ====================

// Get all applications - PROTECTED
router.get('/', authMiddleware, async (req, res) => {
  try {
    const applications = await Application.find().sort({ createdAt: -1 });
    res.json(applications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get application by ID - PROTECTED
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }
    res.json(application);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// OLD document route - PROTECTED (keeping for admin use)
router.get('/:id/document', authMiddleware, async (req, res) => {
  try {
    console.log('[PROTECTED DOWNLOAD] Requested ID:', req.params.id);

    const application = await Application.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    let documentUrl = application.documentFilePath || application.documentUrl;

    if (!documentUrl) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // If it's a Cloudinary URL, fetch and stream
    if (documentUrl.startsWith('http://') || documentUrl.startsWith('https://')) {
      try {
        const https = require('https');
        const http = require('http');

        const client = documentUrl.startsWith('https://') ? https : http;

        const fileRequest = client.get(documentUrl, (fileResponse) => {
          if (fileResponse.statusCode === 301 || fileResponse.statusCode === 302) {
            const redirectUrl = fileResponse.headers.location;
            if (redirectUrl) {
              return res.redirect(redirectUrl);
            }
          }

          if (fileResponse.statusCode === 200) {
            res.setHeader('Content-Type', fileResponse.headers['content-type'] || 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="visa-document-${application.applicationId}.pdf"`);
            fileResponse.pipe(res);
          } else {
            return res.status(fileResponse.statusCode).json({ error: 'Failed to fetch document' });
          }
        });

        fileRequest.on('error', (error) => {
          console.error('Error fetching from Cloudinary:', error);
          return res.status(500).json({ error: 'Failed to fetch document' });
        });

        fileRequest.end();
      } catch (error) {
        console.error('Error processing Cloudinary URL:', error);
        return res.status(500).json({ error: 'Failed to process document URL' });
      }
      return;
    }

    // Fallback for local files
    if (fs.existsSync(documentUrl)) {
      return res.download(documentUrl);
    }

    return res.status(404).json({ error: 'Document not found' });
  } catch (error) {
    console.error('Document download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new application - PROTECTED
router.post('/', authMiddleware, [
  body('name').notEmpty().withMessage('Name is required'),
  body('applicationId').notEmpty().withMessage('Application ID is required'),
  body('passportNumber').notEmpty().withMessage('Passport Number is required'),
  body('nationality').notEmpty().withMessage('Nationality is required'),
  body('dob').notEmpty().withMessage('Date of Birth is required'),
  body('address').notEmpty().withMessage('Address is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const applicationData = req.body;
    const application = new Application(applicationData);
    await application.save();

    res.status(201).json(application);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Application ID already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Create application with file upload - PROTECTED
// router.post('/with-document', authMiddleware, upload.single('document'), [
//   body('name').notEmpty().withMessage('Name is required'),
//   body('applicationId').notEmpty().withMessage('Application ID is required'),
//   body('passportNumber').notEmpty().withMessage('Passport Number is required'),
//   body('nationality').notEmpty().withMessage('Nationality is required'),
//   body('dob').notEmpty().withMessage('Date of Birth is required'),
//   body('address').notEmpty().withMessage('Address is required')
// ], async (req, res) => {
//   try {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const applicationData = {
//       ...req.body,
//       dob: new Date(req.body.dob)
//     };

//     if (req.file) {
//       if (req.file.secure_url || req.file.url) {
//         applicationData.documentFilePath = req.file.secure_url || req.file.url;
//         applicationData.documentUrl = null;
//         console.log('✓ File uploaded to Cloudinary:', applicationData.documentFilePath);
//       } else {
//         applicationData.documentFilePath = req.file.path;
//         applicationData.documentUrl = null;
//         console.log('✓ File saved locally:', applicationData.documentFilePath);
//       }
//     }

//     const application = new Application(applicationData);
//     await application.save();

//     res.status(201).json(application);
//   } catch (error) {
//     // Clean up uploaded file on error
//     if (req.file) {
//       try {
//         if (req.file.secure_url || req.file.url) {
//           if (cloudinary && req.file.public_id) {
//             await cloudinary.uploader.destroy(req.file.public_id);
//           }
//         } else if (req.file.path && fs.existsSync(req.file.path)) {
//           fs.unlinkSync(req.file.path);
//         }
//       } catch (cleanupError) {
//         console.error('Error cleaning up uploaded file:', cleanupError);
//       }
//     }

//     if (error.code === 11000) {
//       return res.status(400).json({ error: 'Application ID already exists' });
//     }
//     console.error('Error creating application:', error);
//     res.status(500).json({ error: error.message });
//   }
// });


router.post('/with-document', authMiddleware, upload.single('document'), [
  body('name').notEmpty(),
  body('applicationId').notEmpty(),
  body('passportNumber').notEmpty(),
  body('nationality').notEmpty(),
  body('dob').notEmpty(),
  body('address').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const applicationData = { ...req.body, dob: new Date(req.body.dob) };
    if (req.file) {
      applicationData.documentFilePath = req.file.secure_url || req.file.path;
      applicationData.documentUrl = null;
    }

    const application = new Application(applicationData);
    await application.save();
    res.status(201).json(application);
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    if (error.code === 11000) return res.status(400).json({ error: 'Application ID already exists' });
    res.status(500).json({ error: error.message });
  }
});


// Error handler for multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err && err.message && err.message.includes('Only PDF and DOC')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// Update application - PROTECTED
router.put('/:id', authMiddleware, [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('applicationId').optional().notEmpty().withMessage('Application ID cannot be empty'),
  body('passportNumber').optional().notEmpty().withMessage('Passport Number cannot be empty'),
  body('nationality').optional().notEmpty().withMessage('Nationality cannot be empty'),
  body('address').optional().notEmpty().withMessage('Address cannot be empty')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const updateData = { ...req.body };
    if (updateData.dob) {
      updateData.dob = new Date(updateData.dob);
    }

    const application = await Application.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(application);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update application status - PROTECTED
router.patch('/:id/status', authMiddleware, [
  body('status').isIn(['Pending', 'In Process', 'Success', 'Rejected']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const application = await Application.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(application);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload or replace document - PROTECTED
// router.post('/:id/document', authMiddleware, upload.single('document'), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: 'No file uploaded' });
//     }

//     const application = await Application.findById(req.params.id);
//     if (!application) {
//       if (req.file) {
//         try {
//           if (req.file.secure_url || req.file.url) {
//             if (cloudinary && req.file.public_id) {
//               await cloudinary.uploader.destroy(req.file.public_id);
//             }
//           } else if (req.file.path && fs.existsSync(req.file.path)) {
//             fs.unlinkSync(req.file.path);
//           }
//         } catch (err) {
//           console.error('Error deleting file:', err);
//         }
//       }
//       return res.status(404).json({ error: 'Application not found' });
//     }

//     // Delete old file
//     if (application.documentFilePath) {
//       try {
//         if (cloudinary && application.documentFilePath.startsWith('http')) {
//           const urlParts = application.documentFilePath.split('/');
//           const folderIndex = urlParts.findIndex(part => part === 'visa-applications');
//           if (folderIndex !== -1 && folderIndex < urlParts.length - 1) {
//             const publicIdWithExt = urlParts[urlParts.length - 1];
//             const publicId = publicIdWithExt.split('.')[0];
//             await cloudinary.uploader.destroy(`visa-applications/${publicId}`);
//           }
//         } else if (fs.existsSync(application.documentFilePath)) {
//           fs.unlinkSync(application.documentFilePath);
//         }
//       } catch (err) {
//         console.error('Error deleting old file:', err);
//       }
//     }

//     // Store new file
//     if (req.file.secure_url || req.file.url) {
//       application.documentFilePath = req.file.secure_url || req.file.url;
//     } else {
//       application.documentFilePath = req.file.path;
//     }
//     application.documentUrl = null;
//     await application.save();

//     res.json(application);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

router.post('/:id/document', authMiddleware, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const application = await Application.findById(req.params.id);
    if (!application) {
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Application not found' });
    }

    // Delete old file
    if (application.documentFilePath) {
      if (cloudinary && application.documentFilePath.startsWith('http')) {
        const publicId = application.documentFilePath.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`visa-applications/${publicId}`);
      } else if (fs.existsSync(application.documentFilePath)) fs.unlinkSync(application.documentFilePath);
    }

    // Save new file
    application.documentFilePath = req.file.secure_url || req.file.path;
    application.documentUrl = null;
    await application.save();
    res.json(application);

  } catch (error) {
    console.error(error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

// Delete application - PROTECTED
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Delete associated file
    if (application.documentFilePath) {
      try {
        if (cloudinary && application.documentFilePath.startsWith('http')) {
          const urlParts = application.documentFilePath.split('/');
          const folderIndex = urlParts.findIndex(part => part === 'visa-applications');
          if (folderIndex !== -1 && folderIndex < urlParts.length - 1) {
            const publicIdWithExt = urlParts[urlParts.length - 1];
            const publicId = publicIdWithExt.split('.')[0];
            await cloudinary.uploader.destroy(`visa-applications/${publicId}`);
          }
        } else if (fs.existsSync(application.documentFilePath)) {
          fs.unlinkSync(application.documentFilePath);
        }
      } catch (err) {
        console.error('Error deleting file:', err);
      }
    }

    await Application.findByIdAndDelete(req.params.id);
    res.json({ message: 'Application deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;