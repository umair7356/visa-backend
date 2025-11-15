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

// ==================== PUBLIC ROUTES ====================

// Public route - Check visa status (for user frontend)
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

// Public route - Download document (NO AUTH REQUIRED)
router.get('/:id/document', async (req, res) => {
  try {
    console.log('Document download requested for ID:', req.params.id);

    const application = await Application.findById(req.params.id);
    if (!application) {
      console.log('Application not found');
      return res.status(404).json({ error: 'Application not found' });
    }

    console.log('Application found:', {
      id: application._id,
      applicationId: application.applicationId,
      hasDocumentFilePath: !!application.documentFilePath,
      hasDocumentUrl: !!application.documentUrl
    });

    // Security: Verify application details if provided (optional)
    if (req.query.applicationId || req.query.passportNumber || req.query.dob || req.query.nationality) {
      const { applicationId, passportNumber, dob, nationality } = req.query;

      if (applicationId && application.applicationId !== applicationId) {
        return res.status(403).json({ error: 'Invalid application details' });
      }

      if (passportNumber && application.passportNumber !== passportNumber) {
        return res.status(403).json({ error: 'Invalid application details' });
      }

      if (nationality && application.nationality !== nationality) {
        return res.status(403).json({ error: 'Invalid application details' });
      }

      if (dob) {
        const dobDate = new Date(dob);
        const appDob = new Date(application.dob);
        if (dobDate.toDateString() !== appDob.toDateString()) {
          return res.status(403).json({ error: 'Invalid application details' });
        }
      }
    }

    // Get document URL - prioritize documentFilePath (which has Cloudinary URL)
    let documentUrl = application.documentFilePath || application.documentUrl;

    console.log('Document URL:', documentUrl);

    if (!documentUrl) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // If it's a Cloudinary URL, fetch and stream to client
    if (documentUrl.startsWith('http://') || documentUrl.startsWith('https://')) {
      console.log('Fetching from Cloudinary:', documentUrl);

      try {
        const https = require('https');
        const http = require('http');

        const client = documentUrl.startsWith('https://') ? https : http;

        // Fetch file from Cloudinary
        const fileRequest = client.get(documentUrl, (fileResponse) => {
          console.log('Cloudinary response status:', fileResponse.statusCode);

          // Handle redirects
          if (fileResponse.statusCode === 301 || fileResponse.statusCode === 302) {
            const redirectUrl = fileResponse.headers.location;
            console.log('Redirect to:', redirectUrl);
            if (redirectUrl) {
              return res.redirect(redirectUrl);
            }
          }

          // Handle successful response
          if (fileResponse.statusCode === 200) {
            // Set appropriate headers
            const contentType = fileResponse.headers['content-type'] || 'application/pdf';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="visa-document-${application.applicationId}.pdf"`);

            console.log('Streaming file to client');
            // Stream the file to the client
            fileResponse.pipe(res);
          } else {
            console.error('Bad response from Cloudinary:', fileResponse.statusCode);
            return res.status(fileResponse.statusCode).json({ error: 'Failed to fetch document from Cloudinary' });
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
      console.log('Serving local file:', documentUrl);
      return res.download(documentUrl);
    }

    console.error('Document file not found at path:', documentUrl);
    return res.status(404).json({ error: 'Document not found' });
  } catch (error) {
    console.error('Document download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== PROTECTED ROUTES (with individual auth) ====================

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
router.post('/with-document', authMiddleware, upload.single('document'), [
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

    const applicationData = {
      ...req.body,
      dob: new Date(req.body.dob)
    };

    if (req.file) {
      // Check if file is from Cloudinary or local storage
      if (req.file.secure_url || req.file.url) {
        // Cloudinary file
        applicationData.documentFilePath = req.file.secure_url || req.file.url;
        applicationData.documentUrl = null;
        console.log('✓ File uploaded to Cloudinary:', applicationData.documentFilePath);
      } else {
        // Local file
        applicationData.documentFilePath = req.file.path;
        applicationData.documentUrl = null;
        console.log('✓ File saved locally:', applicationData.documentFilePath);
      }
    }

    const application = new Application(applicationData);
    await application.save();

    res.status(201).json(application);
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        if (req.file.secure_url || req.file.url) {
          if (cloudinary && req.file.public_id) {
            await cloudinary.uploader.destroy(req.file.public_id);
          }
        } else if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded file:', cleanupError);
      }
    }

    if (error.code === 11000) {
      return res.status(400).json({ error: 'Application ID already exists' });
    }
    console.error('Error creating application:', error);
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
router.post('/:id/document', authMiddleware, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const application = await Application.findById(req.params.id);
    if (!application) {
      // Delete uploaded file if application not found
      if (req.file) {
        try {
          if (req.file.secure_url || req.file.url) {
            if (cloudinary && req.file.public_id) {
              await cloudinary.uploader.destroy(req.file.public_id);
            }
          } else if (req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (err) {
          console.error('Error deleting file:', err);
        }
      }
      return res.status(404).json({ error: 'Application not found' });
    }

    // Delete old file if exists
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
        console.error('Error deleting old file:', err);
      }
    }

    // Store new file
    if (req.file.secure_url || req.file.url) {
      application.documentFilePath = req.file.secure_url || req.file.url;
    } else {
      application.documentFilePath = req.file.path;
    }
    application.documentUrl = null;
    await application.save();

    res.json(application);
  } catch (error) {
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

    // Delete associated file if exists
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