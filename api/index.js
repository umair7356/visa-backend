// api/index.js
const app = require('../server');
const connectDB = require('../config/db');

module.exports = async (req, res) => {
  try {
    // Ensure MongoDB is connected before handling the request
    await connectDB();

    // Handle CORS preflight request
    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }

    // Pass request to Express app
    app(req, res);
  } catch (err) {
    console.error("Error connecting DB:", err);
    res.status(500).json({ error: "Database connection failed" });
  }
};
