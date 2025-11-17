const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const authMiddleware = require("../middleware/auth");
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');

// Generate JWT token
const generateToken = (adminId) => {
  return jwt.sign({ adminId }, process.env.JWT_SECRET || 'your-secret-key-change-in-production', {
    expiresIn: '7d'
  });
};

// Admin login
router.post('/login', [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;

    console.log('Login attempt:', { email, password });

    // Find admin by email
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      console.log('Admin not found for email:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('Stored hash in DB:', admin.password);

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    console.log('Password valid:', isPasswordValid);

    if (!isPasswordValid) return res.status(401).json({ error: 'Invalid password' });

    // Generate token
    const token = generateToken(admin._id);

    res.json({
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Profile route
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const admin = req.admin;
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    res.json({
      id: admin._id,
      name: admin.name,
      email: admin.email,
      emailUpdated: admin.emailUpdated || false
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update admin
router.put('/update', [
  body('email').optional().isEmail().withMessage('Please provide a valid email'),
  body('newpassword').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('oldPassword').optional().notEmpty().withMessage('Old password is required to change password'),
  body('name').optional().notEmpty().withMessage('Name cannot be empty')
], authMiddleware, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, newpassword, oldPassword, name } = req.body;

    const admin = await Admin.findById(req.admin._id);
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    console.log('Update attempt:', { email, newpassword, oldPassword, name });
    console.log('Stored hash before update:', admin.password);

    // Update name
    if (name) admin.name = name;

    // Update email
    if (email) {
      if (admin.emailUpdated) {
        console.log('Email already updated once');
        return res.status(400).json({ error: 'Email can only be updated once' });
      }
      admin.email = email.toLowerCase();
      admin.emailUpdated = true;
    }

    // Update password
   if (newpassword) {
  if (!oldPassword) return res.status(400).json({ error: 'Old password is required' });

  const isMatch = await bcrypt.compare(oldPassword, admin.password);
  if (!isMatch) return res.status(400).json({ error: 'Old password is incorrect' });

  // Just assign plain password
  admin.password = newpassword; // Mongoose pre-save hook will hash automatically
}


    await admin.save();

    console.log('Admin updated successfully:', admin);

    res.json({
      message: 'Admin updated successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email
      }
    });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
