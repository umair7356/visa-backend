// api/index.js
const app = require('../server');

module.exports = (req, res) => {
     if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  app(req, res); // Pass request to Express
};
