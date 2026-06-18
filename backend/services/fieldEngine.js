/**
 * Field Engine — shared schema-driven utilities for import/export/validation.
 * Used by import.controller.js for all modules.
 */
const DynamicField = require('../models/DynamicField');
const Asset        = require('../models/Asset');
const Employee     = require('../models/Employee');

// ─── Fixed field alias maps ──────────────────────────────────────────────────
const ASSET_FIXED_ALIASES = {
  assetTag:       ['assetTag','asset_tag','assettag','tag','id'],
  name:           ['name','assetname','asset_name','title'],
  category:       ['category','cat','type'],
  brand:          ['brand','make','manufacturer'],
  model:          ['model','modelno','model_no'],
  serialno:       ['serialno','serial','serialnumber','serial_no','serial_number','sn'],
  status:         ['status','state'],
  location:       ['location','loc','site'],
  purchaseCost:   ['purchasecost','cost','price','purchaseprice'],
  purchaseDate:   ['purchasedate','purchase_date','bought','purchasedon'],
  warrantyExpiry: ['warrantyexpiry','warranty','warrantydate','warranty_expiry'],
  notes:          ['notes','note','remarks','comments'],
};

const EMPLOYEE_FIXED_ALIASES = {
  name:       ['name','fullname','full_name','employeename'],
  email:      ['email','emailaddress','email_address'],
  phone:      ['phone','mobile','phonenumber','phone_number'],
  department: ['department','dept'],
  regionName: ['regionname','region_name','region'],
  role:       ['role','jobrole'],
  status:     ['status','state'],
  assetTag:   ['assettag','asset_tag','tag'],
};

// ─── Normalise a column header ───────────────────────────────────────────────
function norm(str) {
  return String(str || '').toLowerCase().replace(/[\s_\-]+/g, '');
}

// ─── Find value in row by multiple possible column aliases ───────────────────
function pick(row, aliases) {
  for (const alias of aliases) {
    const key = Object.keys(row).find(k => norm(k) === norm(alias));
    if (key !== undefined && row[key] !== '' && row[key] !== undefined) return String(row[key]).trim();
  }
  return '';
}

/**
 * Fetch dynamic (non-fixed) fields for an entity from DB.
 * Returns system-default fields (tenantId: null) + tenant-specific fields.
 *
 * @param {string}        entityType  'asset' | 'employee'
 * @param {string}        [category]  required for assets
 * @param {ObjectId|null} [tenantId]  if provided, includes tenant-specific fields
 */
async function getFields(entityType, category, tenantId = null) {
  const filter = { entityType, isFixed: false };
  if (entityType === 'asset') filter.category = category || '';
  // Include system defaults (null) + tenant-specific fields
  if (tenantId) {
    filter.$or = [{ tenantId: null }, { tenantId }];
  }
  return DynamicField.find(filter).sort({ order: 1 });
}

/**
 * Map a raw CSV/XLSX row to a structured object.
 * Fixed fields are resolved via alias maps; remaining columns become customFields.
 *
 * @param {object} row           Raw row from parseFile
 * @param {object} fixedAliases  e.g. ASSET_FIXED_ALIASES
 * @param {object} [defaults]    Default values for fixed fields (e.g. { status: 'Available' })
 * @returns {{ fixed: object, customFields: object }}
 */
function mapRowToFields(row, fixedAliases, defaults = {}) {
  const fixed = {};
  const fixedNorms = new Set();

  for (const [key, aliases] of Object.entries(fixedAliases)) {
    fixed[key] = pick(row, aliases) || defaults[key] || '';
    aliases.forEach(a => fixedNorms.add(norm(a)));
  }

  // Pass-through unknown columns as custom fields
  const customFields = {};
  for (const k of Object.keys(row)) {
    if (!fixedNorms.has(norm(k)) && row[k] !== '' && row[k] !== undefined) {
      customFields[k] = String(row[k]).trim();
    }
  }

  return { fixed, customFields };
}

/**
 * Validate a mapped row against required fixed fields + required dynamic fields.
 *
 * @param {object} fixed         Fixed field values
 * @param {object} customFields  Custom field values
 * @param {string[]} requiredFixed  Keys that must be non-empty
 * @param {DynamicField[]} dynamicFields  Dynamic field definitions
 * @param {number} idx           Row index (0-based)
 * @returns {{ row, errors, data } | null}
 */
function validateRow(fixed, customFields, requiredFixed, dynamicFields, idx) {
  const errors = [];

  for (const key of requiredFixed) {
    if (!fixed[key]) errors.push(`${key} is required`);
  }

  for (const f of dynamicFields) {
    if (f.required && !customFields[f.name]) errors.push(`${f.label} is required`);
  }

  return errors.length ? { row: idx + 2, errors, data: { ...fixed, ...customFields } } : null;
}

/**
 * Build CSV template headers + sample row from fixed headers and dynamic fields.
 *
 * @param {string[]} fixedHeaders  Fixed column names
 * @param {string[]} fixedSample   Sample values for fixed columns
 * @param {DynamicField[]} dynamicFields
 * @returns {{ headers: string[], sample: string[] }}
 */
function buildTemplateHeaders(fixedHeaders, fixedSample, dynamicFields) {
  const headers = [...fixedHeaders];
  const sample  = [...fixedSample];
  for (const f of dynamicFields) {
    headers.push(f.name);
    sample.push('');
  }
  return { headers, sample };
}

/**
 * Remove orphaned customField keys from an entity document.
 * Scoped to tenantId when provided.
 *
 * @param {'asset'|'employee'} entityType
 * @param {string}             [category]
 * @param {ObjectId|null}      [tenantId]
 */
async function cleanCustomFields(entityType, category, tenantId = null) {
  const Model = entityType === 'asset' ? Asset : Employee;

  const fieldFilter = { entityType, isDeleted: { $ne: true } };
  if (entityType === 'asset') fieldFilter.category = category || '';
  if (tenantId) fieldFilter.$or = [{ tenantId: null }, { tenantId }];

  const activeFields = await DynamicField.find(fieldFilter, 'name').lean();
  const activeNames  = new Set(activeFields.map(f => f.name));

  const fixedFilter = { entityType, isFixed: true };
  if (entityType === 'asset') fixedFilter.category = category || '';
  const fixedFields = await DynamicField.find(fixedFilter, 'name').lean();
  fixedFields.forEach(f => activeNames.add(f.name));

  // Scope document scan to tenant
  const docFilter = {};
  if (entityType === 'asset' && category) docFilter.category = category;
  if (tenantId) docFilter.tenantId = tenantId;

  const docs = await Model.find(docFilter).select('customFields').lean();

  let cleaned = 0;
  const removedKeys = new Set();

  for (const doc of docs) {
    const cf = doc.customFields instanceof Map
      ? Object.fromEntries(doc.customFields)
      : (doc.customFields || {});

    const orphans = Object.keys(cf).filter(k => !activeNames.has(k));
    if (!orphans.length) continue;

    const unset = {};
    orphans.forEach(k => { unset[`customFields.${k}`] = ''; removedKeys.add(k); });
    await Model.updateOne({ _id: doc._id }, { $unset: unset });
    cleaned++;
  }

  return { cleaned, removed: [...removedKeys] };
}

/**
 * Validate that customField values match their declared type.
 * Returns an array of error strings for any type mismatches.
 *
 * @param {object}         customFields  { fieldName: value }
 * @param {DynamicField[]} dynamicFields Active field definitions
 * @returns {string[]} errors
 */
function validateCustomFieldTypes(customFields, dynamicFields) {
  const errors = [];
  for (const f of dynamicFields) {
    const val = customFields[f.name];
    if (!val && val !== 0) continue; // empty is fine (required check is separate)

    if (f.type === 'number' && isNaN(Number(val))) {
      errors.push(`${f.label}: expected a number, got "${val}"`);
    }
    if (f.type === 'date') {
      const d = new Date(val);
      if (isNaN(d.getTime())) errors.push(`${f.label}: expected a valid date, got "${val}"`);
    }
    if (f.type === 'select' && f.options?.length && !f.options.includes(val)) {
      errors.push(`${f.label}: "${val}" is not a valid option (${f.options.join(', ')})`);
    }
  }
  return errors;
}

/**
 * Full import row validation: required fields + type checks + strict-mode unknown column check.
 *
 * @param {object}   fixed          Fixed field values
 * @param {object}   customFields   Custom field values from CSV
 * @param {string[]} requiredFixed  Fixed keys that must be non-empty
 * @param {DynamicField[]} dynamicFields  Active field definitions
 * @param {number}   idx            Row index (0-based)
 * @param {object}   [opts]
 * @param {boolean}  [opts.strict]  If true, unknown columns are errors; default false (relaxed)
 * @returns {{ row, errors, warnings, data } | null}
 */
function validateImportRow(fixed, customFields, requiredFixed, dynamicFields, idx, opts = {}) {
  const errors = [];
  const warnings = [];

  // Required fixed fields
  for (const key of requiredFixed) {
    if (!fixed[key]) errors.push(`${key} is required`);
  }

  // Required + type-checked dynamic fields
  const knownNames = new Set(dynamicFields.map(f => f.name));
  for (const f of dynamicFields) {
    if (f.required && !customFields[f.name]) {
      errors.push(`${f.label} is required`);
    }
  }
  const typeErrors = validateCustomFieldTypes(customFields, dynamicFields);
  errors.push(...typeErrors);

  // Unknown column handling
  const unknownKeys = Object.keys(customFields).filter(k => !knownNames.has(k));
  if (unknownKeys.length) {
    if (opts.strict) {
      errors.push(`Unknown columns: ${unknownKeys.join(', ')} — remove them or add them as fields first`);
    } else {
      warnings.push(`Unknown columns will be ignored: ${unknownKeys.join(', ')}`);
    }
  }

  if (errors.length) return { row: idx + 2, errors, warnings, data: { ...fixed, ...customFields } };
  return warnings.length ? { row: idx + 2, errors: [], warnings, data: { ...fixed, ...customFields } } : null;
}

/**
 * Cast a raw string value to the correct JS type based on field.type.
 *
 * field.type === 'number' → Number (NaN becomes undefined — rejected by validation)
 * field.type === 'date'   → Date   (invalid date becomes undefined)
 * field.type === 'select' | 'text' | anything else → String (trimmed)
 *
 * @param {string} rawValue
 * @param {string} fieldType  'text' | 'number' | 'date' | 'select'
 * @returns {string|number|Date|undefined}
 */
function castCustomFieldValue(rawValue, fieldType) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return undefined;
  const s = String(rawValue).trim();
  if (!s) return undefined;

  if (fieldType === 'number') {
    const n = Number(s);
    return isNaN(n) ? undefined : n;
  }
  if (fieldType === 'date') {
    const d = new Date(s);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return s; // text / select / unknown → string
}

module.exports = {
  ASSET_FIXED_ALIASES,
  EMPLOYEE_FIXED_ALIASES,
  norm,
  pick,
  getFields,
  mapRowToFields,
  validateRow,
  buildTemplateHeaders,
  cleanCustomFields,
  validateCustomFieldTypes,
  validateImportRow,
  castCustomFieldValue,
};
