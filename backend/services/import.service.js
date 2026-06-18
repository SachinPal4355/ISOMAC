/**
 * Import Service
 * Handles CSV/XLSX parsing and bulk DB operations for all modules.
 * Field mapping and validation are delegated to fieldEngine.js.
 */
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');

// ─── Parse uploaded buffer into array of row objects ───────────────────────
function parseFile(buffer, mimetype, originalname) {
  const ext = originalname.split('.').pop().toLowerCase();

  if (ext === 'csv' || mimetype === 'text/csv') {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, ''); // strip BOM
    return parse(text, { columns: true, skip_empty_lines: true, trim: true });
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '' });
  }

  throw new Error('Unsupported file type. Use CSV or XLSX.');
}

// ─── INVENTORY FIELD MAP ────────────────────────────────────────────────────
const { pick } = require('./fieldEngine');

function mapInventoryRow(row) {
  return {
    itemName:     pick(row, ['itemname','item_name','item','name','category']),
    serialno:     pick(row, ['serialno','serial','serialnumber','serial_no','sn']),
    name:         pick(row, ['assignedto','assigned_to','name','user','employee']),
    email:        pick(row, ['email','emailaddress','email_address']),
    purchaseDate: pick(row, ['purchasedate','purchase_date','bought']),
    status:       pick(row, ['status','state']) || 'In Stock',
    comment:      pick(row, ['comment','comments','notes','remarks']),
  };
}

// ─── LOCATION FIELD MAP ─────────────────────────────────────────────────────
function mapLocationRow(row) {
  return {
    name:        pick(row, ['name','location','locationname','location_name']),
    description: pick(row, ['description','desc','details']),
    address:     pick(row, ['address','addr','site']),
  };
}

// ─── VALIDATE INVENTORY ROW ─────────────────────────────────────────────────
function validateInventory(mapped, idx) {
  const errors = [];
  if (!mapped.itemName) errors.push('itemName is required');
  if (!mapped.serialno) errors.push('serialno is required');
  return errors.length ? { row: idx + 2, errors, data: mapped } : null;
}

// ─── VALIDATE LOCATION ROW ──────────────────────────────────────────────────
function validateLocation(mapped, idx) {
  const errors = [];
  if (!mapped.name) errors.push('name is required');
  return errors.length ? { row: idx + 2, errors, data: mapped } : null;
}

// ─── PARSE + VALIDATE (returns { valid, invalid, preview }) ─────────────────
function processRows(rows, mapFn, validateFn) {
  const valid = [], invalid = [];
  rows.forEach((row, idx) => {
    const mapped = mapFn(row);
    const err = validateFn(mapped, idx);
    if (err) invalid.push(err);
    else valid.push(mapped);
  });
  return { valid, invalid, preview: valid.slice(0, 10) };
}

module.exports = { parseFile, mapInventoryRow, mapLocationRow, validateInventory, validateLocation, processRows };
