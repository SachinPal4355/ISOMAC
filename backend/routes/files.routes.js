const express = require('express');
const PDF     = require('../models/PDF');
const { requireAuth, requireRole, enforceTenantScope } = require('../middleware/auth');
const { uploadDocument, validateUploadedFile } = require('../middleware/fileValidation');

const router = express.Router();

// POST /upload — tenant-scoped, stamps tenantId
router.post(
  '/upload',
  requireAuth,
  enforceTenantScope,
  uploadDocument.single('pdf'),
  validateUploadedFile,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
      const doc = new PDF({
        filename:    req.file.originalname,
        data:        req.file.buffer,
        contentType: req.file.mimetype,
        tenantId:    req.tenantId || null,
        uploadedBy:  req.authUser?._id || null,
      });
      await doc.save();
      res.json({
        message: 'File uploaded',
        file: { _id: doc._id, filename: doc.filename, uploadDate: doc.uploadDate },
      });
    } catch (err) {
      console.error('❌ Upload error:', err.message);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

router.use((err, req, res, next) => {
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.message)) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the 5 MB size limit.' : err.message;
    return res.status(400).json({ message: msg });
  }
  next(err);
});

// GET /files — tenant-scoped
router.get('/files', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const files = await PDF.find({ ...req.tenantFilter }).select('_id filename uploadDate').sort({ uploadDate: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /files/:id — tenant-scoped
router.get('/files/:id', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const file = await PDF.findOne({ _id: req.params.id, ...req.tenantFilter });
    if (!file) return res.status(404).send('File not found');
    res.contentType(file.contentType);
    res.send(file.data);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// DELETE /files/:id — tenant-scoped
router.delete('/files/:id', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const file = await PDF.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter });
    if (!file) return res.status(404).json({ message: 'File not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /files — bulk delete, tenant-scoped
router.delete('/files', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ message: 'No ids provided' });
    await PDF.deleteMany({ _id: { $in: ids }, ...req.tenantFilter });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
