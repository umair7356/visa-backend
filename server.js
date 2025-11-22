// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/db');

const app = express();

// Connect to MongoDB
connectDB();

// Allowed frontend origins
const allowedOrigins = [
  "https://admin.serb-evisa-track.online",
  "https://serb-evisa-track.online"
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow requests like Postman
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

// Middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Handle preflight
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static uploads
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/admin', require('./routes/authRoutes'));
app.use('/api/applications', require('./routes/applicationRoutes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Local dev server
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Local server running on port ${PORT}`);
  });
}

module.exports = app;
