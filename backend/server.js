// =========================
// 📦 College Bus Management System Server
// =========================

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// Import all route files
const adminRoutes = require('./routes/admin');
const busesRoutes = require('./routes/buses');
const studentsRoutes = require('./routes/students');
const loginRoute = require('./routes/login');
const adminResetRoutes = require('./routes/admin_reset');

// Initialize Express app
const app = express();

// =========================
// 🧰 Middleware setup
// =========================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`📝 ${req.method} ${req.path}`, req.body);
  next();
});

// =========================
// 🧭 API Routes
// =========================
app.use('/api/login', loginRoute);           // ✅ Combined admin + student login
app.use('/api/admin', adminRoutes);          // Admin-only actions
app.use('/api/admin', adminResetRoutes);    // Admin reset (email/token) endpoints
app.use('/api/buses', busesRoutes);          // Bus CRUD operations
app.use('/api/students', studentsRoutes);    // Student CRUD + dashboard

// =========================
// 🌐 Frontend Serve
// =========================
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Default route (for all non-API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// =========================
// 🚀 Server Startup
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
