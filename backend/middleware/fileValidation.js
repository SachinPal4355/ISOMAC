/**
 * fileValidation.js — Multer file filter + magic byte validation
 *
 * Two-layer defence:
 *   Layer 1 (Multer fileFilter): checks MIME type + extension before buffer is read.
 *   Layer 2 (validateUploadedFile): checks actual first bytes of the buffer.
 *             Catches files with spoofed extensions.
 *
 * Allowed: PDF, CSV, XLSX, XLS, JPEG, PNG, GIF, WEBP
 * Blocked: .exe .sh .bat .ps1 .js .py .php .bin and any executable magic bytes
 */

const path   = require('path');
const multer = require('multer');

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const BLOCKED_EXT = new Set([
  '.exe','.dll','.so','.dylib',
  '.sh','.bash','.zsh','.fish',
  '.bat','.cmd','.com','.ps1','.psm1',
  '.js','.mjs','.cjs','.ts',
  '.py','.pyc','.pyo',
  '.php','.php3','.php4','.php5','.phtml',
  '.rb','.pl','.perl',
  '.bin','.elf','.out',
  '.vbs','.vbe','.wsf','.wsh',
  '.jar','.class',
  '.app','.dmg','.pkg','.deb','.rpm',
]);

// Magic byte signatures for executables
const EXEC_MAGIC = [
  Buffer.from([0x4D, 0x5A]),             // MZ  — Windows PE
  Buffer.from([0x7F, 0x45, 0x4C, 0x46]),// ELF — Linux
  Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]),// Mach-O fat
  Buffer.from([0xCE, 0xFA, 0xED, 0xFE]),// Mach-O 32-bit
  Buffer.from([0xCF, 0xFA, 0xED, 0xFE]),// Mach-O 64-bit
  Buffer.from([0x23, 0x21]),             // #!  — shebang scripts
];

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (BLOCKED_EXT.has(ext)) {
    return cb(new Error(`File type "${ext}" is not allowed.`), false);
  }
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    return cb(new Error(`MIME type "${file.mimetype}" is not allowed.`), false);
  }
  cb(null, true);
}

function importFileFilter(req, file, cb) {
  const ext  = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();
  const ok   = (ext === '.csv' || ext === '.xlsx' || ext === '.xls') &&
               (mime.includes('csv') || mime.includes('excel') ||
                mime.includes('spreadsheet') || mime === 'text/plain');
  if (!ok) return cb(new Error('Only CSV and XLSX files are allowed for import.'), false);
  cb(null, true);
}

/**
 * Express middleware — validates magic bytes after multer stores the buffer.
 * Place AFTER upload.single() in the route chain.
 */
function validateUploadedFile(req, res, next) {
  if (!req.file) return next();
  const buf = req.file.buffer;
  if (!buf || buf.length < 4) return next();
  for (const magic of EXEC_MAGIC) {
    if (buf.slice(0, magic.length).equals(magic)) {
      return res.status(400).json({ message: 'File content matches an executable format and was rejected.' });
    }
  }
  next();
}

/** For /upload (PDF + images) — 5 MB */
const uploadDocument = multer({
  storage:    multer.memoryStorage(),
  limits:     { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

/** For /import (CSV + XLSX only) — 5 MB */
const uploadImport = multer({
  storage:    multer.memoryStorage(),
  limits:     { fileSize: 5 * 1024 * 1024 },
  fileFilter: importFileFilter,
});

module.exports = { uploadDocument, uploadImport, validateUploadedFile };
