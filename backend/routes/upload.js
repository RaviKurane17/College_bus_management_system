// =========================
// 📸 Upload Routes (Production-Level)
// JWT-protected, env-based Cloudinary config
// =========================
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { authenticateAdmin, authenticateAny } = require('../middleware/auth');

// Configure Cloudinary using environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'sgi_bus_system/students',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
  }
});

const receiptStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'sgi_bus_system/receipts',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf']
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    // Only allow image files and pdfs
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, WEBP) and PDF are allowed'), false);
    }
  }
});

const uploadReceipt = multer({
  storage: receiptStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDFs are allowed'), false);
    }
  }
});

// Upload student photo (protected)
router.post('/student-photo', authenticateAdmin, upload.single('photo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    res.json({
      success: true,
      message: 'Photo uploaded successfully',
      photo_url: req.file.path
    });
  } catch (err) {
    console.error('Upload Error:', err);
    let errorMessage = err.message || 'Unknown error';
    if (errorMessage.toLowerCase().includes('limit')) {
      errorMessage = 'Cloud Storage Limit Exceeded on Cloudinary.';
    }
    return res.status(500).json({ success: false, message: errorMessage });
  }
});

// Upload payment receipt (protected)
router.post('/receipt', authenticateAny, uploadReceipt.single('receipt'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    res.json({
      success: true,
      message: 'Receipt uploaded successfully',
      receipt_url: req.file.path
    });
  } catch (err) {
    console.error('Upload Error:', err);
    let errorMessage = err.message || 'Unknown error';
    if (errorMessage.toLowerCase().includes('limit')) {
      errorMessage = 'Cloud Storage Limit Exceeded on Cloudinary.';
    }
    return res.status(500).json({ success: false, message: errorMessage });
  }
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large. Maximum size is 5MB.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
});

module.exports = router;
