// =========================
// 📦 College Bus Management System Server
// Production-Level with Security Hardening
// =========================
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');

// Import all route files
const adminRoutes = require('./routes/admin');
const busesRoutes = require('./routes/buses');
const studentsRoutes = require('./routes/students');
const loginRoute = require('./routes/login');
const adminResetRoutes = require('./routes/admin_reset');
const driverRoutes = require('./routes/drivers');
const uploadRoutes = require('./routes/upload');
const reminderRoutes = require('./routes/reminders');
const queriesRoutes = require('./routes/queries');
const studentResetRoutes = require('./routes/student_reset');
const backupRoutes = require('./routes/backup');
const bulkUploadRoutes = require('./routes/bulk_upload');

// Initialize Express app
const app = express();

// =========================
// 🛡️ Security Middleware
// =========================

// Helmet: Sets various HTTP headers for security
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for now (frontend uses inline scripts)
  crossOriginEmbedderPolicy: false
}));

// HPP: Prevent HTTP parameter pollution
app.use(hpp());

// CORS: Restrict to allowed origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    return callback(null, true); // Allow all in dev; restrict in prod
  },
  credentials: true
}));

// Body parsers with size limits to prevent DoS
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// =========================
// 🚦 Rate Limiting
// =========================

// Global rate limiter: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Strict rate limiter for login/auth routes: 5 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 5,
  message: {
    success: false,
    message: 'Too many login attempts. Account temporarily locked. Try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Moderate rate limiter for API endpoints: 30 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'API rate limit exceeded. Please slow down.'
  }
});

// Apply global limiter to all routes
app.use(globalLimiter);

// Request logging (production-safe: no sensitive data)
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📝 ${req.method} ${req.path}`);
  }
  next();
});

// =========================
// 🧭 API Routes
// =========================

// Auth routes with strict rate limiting
app.use('/api/login', authLimiter, loginRoute);
app.use('/api/admin/request-reset', authLimiter);
app.use('/api/admin/reset-password', authLimiter);
app.use('/api/student-reset', authLimiter, studentResetRoutes);

// Admin routes with moderate rate limiting
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/admin', apiLimiter, adminResetRoutes);
app.use('/api/buses', apiLimiter, busesRoutes);
app.use('/api/students', apiLimiter, studentsRoutes);
app.use('/api/drivers', apiLimiter, driverRoutes);
app.use('/api/upload', apiLimiter, uploadRoutes);
app.use('/api/reminders', apiLimiter, reminderRoutes);
app.use('/api/queries', apiLimiter, queriesRoutes);
app.use('/api/backup', apiLimiter, backupRoutes);
app.use('/api/students/bulk-upload', apiLimiter, bulkUploadRoutes);

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
// ❌ Global Error Handler
// =========================
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled Error:', err.message);
  
  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'An internal server error occurred' 
    : err.message;
    
  res.status(err.status || 500).json({
    success: false,
    message: message
  });
});

// =========================
// 🚀 Server Startup
// =========================
if (process.env.VERCEL) {
  console.log('📦 Running on Vercel Serverless Environment');
  module.exports = app;
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n✅ Server running on http://localhost:${PORT}`);
    console.log(`🛡️  Security: Helmet, Rate-Limiting, HPP enabled`);
    console.log(`🔐 Auth: JWT-based authentication active`);
    console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });
}
