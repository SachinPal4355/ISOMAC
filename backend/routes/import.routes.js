const express  = require('express');
const { requireAuth, requireRole, enforceTenantScope } = require('../middleware/auth');
const { uploadImport, validateUploadedFile } = require('../middleware/fileValidation');
const { preview, commit, template } = require('../controllers/import.controller');

const router = express.Router();

function handleMulterError(err, req, res, next) {
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.message)) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'File exceeds the 5 MB size limit.'
      : err.message;
    return res.status(400).json({ message: msg });
  }
  next(err);
}

// Employee-specific routes
router.get( '/employees/template', requireAuth, requireRole('admin', 'editor'), template);
router.post('/employees/preview',  requireAuth, requireRole('admin', 'editor'), enforceTenantScope, uploadImport.single('file'), validateUploadedFile, preview);
router.post('/employees/commit',   requireAuth, requireRole('admin', 'editor'), enforceTenantScope, uploadImport.single('file'), validateUploadedFile, commit);

// Generic module routes
router.get( '/:module/template', requireAuth, template);
router.post('/:module/preview',  requireAuth, enforceTenantScope, uploadImport.single('file'), validateUploadedFile, preview);
router.post('/:module/commit',   requireAuth, enforceTenantScope, uploadImport.single('file'), validateUploadedFile, commit);

router.use(handleMulterError);

module.exports = router;
