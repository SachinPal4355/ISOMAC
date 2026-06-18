require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo').MongoStore;
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');
const { sanitizeBody } = require('./middleware/sanitize');
const { restrictGoogleUser } = require('./middleware/auth');
const { initSentry, sentryErrorHandler, setUserContext } = require('./lib/sentry');
const logger = require('./lib/logger');
// Cron jobs are intentionally NOT imported here.
// They run in the dedicated isomac-cron PM2 process (cron.js).
// Importing them here would cause duplicate execution in cluster mode.
const DynamicField = require('./models/DynamicField');
const AssetCategory = require('./models/AssetCategory');
const compression = require('compression');
const passport = require('passport');

const app = express();

// ── Sentry must be initialised before any other middleware ────────────────────
initSentry(app);

// --- Config ---
const HOST           = process.env.HOST || '0.0.0.0';
const PORT           = Number(process.env.PORT || 5000);
const MONGO_URI      = process.env.MONGO_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;
const CORS_ORIGIN    = process.env.CORS_ORIGIN || 'http://localhost:5173';
const NODE_ENV       = process.env.NODE_ENV || 'development';

// --- Startup secret validation ---
// Refuse to start in production with missing or placeholder secrets.
if (!MONGO_URI) {
  console.error('❌ MONGO_URI missing. Set MONGO_URI in .env before starting.');
  process.exit(1);
}
const PLACEHOLDER = ['changeme', 'CHANGE_ME', 'REPLACE_WITH'];
if (NODE_ENV === 'production') {
  if (!SESSION_SECRET || PLACEHOLDER.some(p => SESSION_SECRET.includes(p))) {
    console.error('❌ SESSION_SECRET is missing or is a placeholder. Set a real secret before deploying.');
    process.exit(1);
  }
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || PLACEHOLDER.some(p => jwtSecret.includes(p))) {
    console.error('❌ JWT_SECRET is missing or is a placeholder. Set a real secret before deploying.');
    process.exit(1);
  }
}
// SESSION_SECRET dev fallback — only active when NODE_ENV !== production
const SESSION_SECRET_SAFE = SESSION_SECRET || 'dev-only-session-secret-not-for-production';

console.log(`[config] NODE_ENV=${NODE_ENV}`);
console.log(`[config] CORS_ORIGIN=${CORS_ORIGIN}`);
console.log(`[config] MONGO_URI=${MONGO_URI.replace(/:([^@]+)@/, ':***@')}`);

// --- Security ---
// CSP: only allow resources from our own origin.
// 'unsafe-inline' on style-src is required for Tailwind's runtime styles.
// script-src is strict 'self' only — no inline scripts, no eval.
const cspDirectives = {
  defaultSrc:  ["'self'"],
  scriptSrc:   ["'self'"],
  styleSrc:    ["'self'", "'unsafe-inline'"],   // Tailwind needs this
  imgSrc:      ["'self'", 'data:', 'blob:'],    // blob: for PDF previews
  connectSrc:  ["'self'"],                       // API calls to own domain only
  fontSrc:     ["'self'"],
  objectSrc:   ["'none'"],                       // block Flash / plugins
  frameSrc:    ["'self'"],                       // allow same-origin iframes (PDF viewer)
  frameAncestors: ["'none'"],                    // prevent clickjacking
  baseUri:     ["'self'"],
  formAction:  ["'self'"],
};

app.use(helmet({
  contentSecurityPolicy: { directives: cspDirectives },
  crossOriginEmbedderPolicy: false,  // needed for PDF blob rendering
  hsts: NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
}));

// --- CORS ---
const corsOrigin = NODE_ENV === 'production'
  ? CORS_ORIGIN
  : (origin, cb) => {
      // In dev, allow any localhost origin regardless of port
      if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    };
app.use(cors({ origin: corsOrigin, credentials: true }));

// --- Logging ---
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// --- Compression (gzip responses) ---
app.use(compression());

// --- Body parsing ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Input sanitization (XSS) — runs on every request body before routes ---
app.use(sanitizeBody);

// --- Google user restriction — applied after auth, before routes ---
// Google users can only access: /me, /requests, /logout, /auth/refresh
app.use((req, res, next) => {
  // Only runs if requireAuth has already set req.authUser
  if (req.authUser) return restrictGoogleUser(req, res, next);
  next();
});

// --- Sentry user context — attach identity to all events after auth ───────────
// Applied globally so any route that calls requireAuth gets user context in Sentry.
app.use((req, _res, next) => {
  if (req.authUser) return setUserContext(req, _res, next);
  next();
});

// --- Passport (Google OAuth) ---
// Strategy is only registered when GOOGLE_CLIENT_ID is configured.
// passport.session() is NOT used — we use our own session + JWT system.
app.use(passport.initialize());
const googleProvider = require('./auth/providers/google.provider');
if (googleProvider.enabled) {
  const strategy = googleProvider.buildStrategy();
  if (strategy) {
    passport.use(strategy);
    console.log('[passport] ✅ Google OAuth strategy registered');
  }
} else {
  console.log('[passport] ℹ️  Google OAuth not configured (GOOGLE_CLIENT_ID not set)');
}

// --- SAML SSO ---
const samlProvider = require('./auth/providers/saml.provider');
if (samlProvider.enabled) {
  const samlStrategy = samlProvider.buildStrategy();
  if (samlStrategy) {
    passport.use('saml', samlStrategy);
    console.log('[passport] ✅ SAML SSO strategy registered');
  }
} else {
  console.log('[passport] ℹ️  SAML SSO not configured (SAML_ENABLED not set)');
}

// --- Session ---
app.use(session({
  secret: SESSION_SECRET_SAFE,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI, ttl: 8 * 60 * 60 }),
  cookie: {
    secure:   NODE_ENV === 'production',
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge:   8 * 60 * 60 * 1000,
    httpOnly: true,
  },
}));

// --- Rate limiting ---
// Global: generous limit for all routes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Auth-specific: strict limit on login/register to block brute force
// NOTE: /login, /register, /auth/refresh now have their own limiter inside auth.routes.js
// The global limiter above still applies as a second layer.

// --- MongoDB ---
async function seedDynamicFields() {
  try {
    const count = await DynamicField.countDocuments();
    if (count > 0) return;

    const fixedBase = (category, startOrder) => [
      { entityType: 'asset', category, name: 'assetTag',       label: 'Asset Tag',      type: 'text',   required: true,  visible: true,  order: startOrder,     isFixed: true },
      { entityType: 'asset', category, name: 'name',           label: 'Name',           type: 'text',   required: true,  visible: true,  order: startOrder + 1, isFixed: true },
      { entityType: 'asset', category, name: 'brand',          label: 'Brand',          type: 'text',   required: false, visible: true,  order: startOrder + 2, isFixed: true },
      { entityType: 'asset', category, name: 'model',          label: 'Model',          type: 'text',   required: false, visible: true,  order: startOrder + 3, isFixed: true },
      { entityType: 'asset', category, name: 'serialno',       label: 'Serial No',      type: 'text',   required: false, visible: true,  order: startOrder + 4, isFixed: true },
      { entityType: 'asset', category, name: 'status',         label: 'Status',         type: 'select', required: true,  visible: true,  order: startOrder + 5, isFixed: true, options: ['Available','Assigned','In Repair','Retired','Missing'] },
      { entityType: 'asset', category, name: 'location',       label: 'Location',       type: 'text',   required: false, visible: true,  order: startOrder + 6, isFixed: true },
      { entityType: 'asset', category, name: 'warrantyExpiry', label: 'Warranty',       type: 'date',   required: false, visible: true,  order: startOrder + 7, isFixed: true },
    ];

    const assetCustom = [
      { entityType: 'asset', category: 'Laptop',          name: 'ram',        label: 'RAM',         type: 'text', required: false, visible: true, order: 20, isFixed: false },
      { entityType: 'asset', category: 'Laptop',          name: 'processor',  label: 'Processor',   type: 'text', required: false, visible: true, order: 21, isFixed: false },
      { entityType: 'asset', category: 'Laptop',          name: 'os',         label: 'OS',          type: 'text', required: false, visible: true, order: 22, isFixed: false },
      { entityType: 'asset', category: 'MacBook',         name: 'ram',        label: 'RAM',         type: 'text', required: false, visible: true, order: 20, isFixed: false },
      { entityType: 'asset', category: 'MacBook',         name: 'chip',       label: 'Chip',        type: 'text', required: false, visible: true, order: 21, isFixed: false },
      { entityType: 'asset', category: 'Monitor',         name: 'screenSize', label: 'Screen Size', type: 'text', required: false, visible: true, order: 20, isFixed: false },
      { entityType: 'asset', category: 'Monitor',         name: 'resolution', label: 'Resolution',  type: 'text', required: false, visible: true, order: 21, isFixed: false },
      { entityType: 'asset', category: 'Mac Mini',        name: 'ram',        label: 'RAM',         type: 'text', required: false, visible: true, order: 20, isFixed: false },
      { entityType: 'asset', category: 'Mac Mini',        name: 'chip',       label: 'Chip',        type: 'text', required: false, visible: true, order: 21, isFixed: false },
      { entityType: 'asset', category: 'iMac',            name: 'ram',        label: 'RAM',         type: 'text', required: false, visible: true, order: 20, isFixed: false },
      { entityType: 'asset', category: 'iMac',            name: 'screenSize', label: 'Screen Size', type: 'text', required: false, visible: true, order: 21, isFixed: false },
      { entityType: 'asset', category: 'Docking Station', name: 'ports',      label: 'Ports',       type: 'text', required: false, visible: true, order: 20, isFixed: false },
    ];

    const employeeFields = [
      { entityType: 'employee', category: '', name: 'name',           label: 'Full Name',       type: 'text',   required: true,  visible: true,  order: 1, isFixed: true },
      { entityType: 'employee', category: '', name: 'email',          label: 'Email',           type: 'text',   required: true,  visible: true,  order: 2, isFixed: true },
      { entityType: 'employee', category: '', name: 'phone',          label: 'Phone',           type: 'text',   required: false, visible: true,  order: 3, isFixed: true },
      { entityType: 'employee', category: '', name: 'department',     label: 'Department',      type: 'text',   required: true,  visible: true,  order: 4, isFixed: true },
      { entityType: 'employee', category: '', name: 'region',         label: 'Region',          type: 'text',   required: true,  visible: true,  order: 5, isFixed: true },
      { entityType: 'employee', category: '', name: 'assignedAssets', label: 'Assigned Assets', type: 'number', required: false, visible: true,  order: 6, isFixed: true },
      { entityType: 'employee', category: '', name: 'status',         label: 'Status',          type: 'select', required: false, visible: true,  order: 7, isFixed: true, options: ['Active', 'Inactive'] },
    ];

    const categories = ['Laptop','MacBook','Mac Mini','iMac','Monitor','Keyboard','Mouse','Headset','Docking Station','Other'];
    const allFixed = categories.flatMap(c => fixedBase(c, 1));
    const accessoryCategories = ['Mouse','Keyboard','Monitor','Headset','Docking Station'];
    const accessoryBase = (category, startOrder) => [
      { entityType: 'accessory', category, name: 'name',        label: 'Item Name',     type: 'text',   required: true,  visible: true, order: startOrder,     isFixed: true },
      { entityType: 'accessory', category, name: 'serialno',    label: 'Serial No',     type: 'text',   required: false, visible: true, order: startOrder + 1, isFixed: true },
      { entityType: 'accessory', category, name: 'location',    label: 'Location',      type: 'text',   required: false, visible: true, order: startOrder + 2, isFixed: true },
      { entityType: 'accessory', category, name: 'vendor',      label: 'Vendor',        type: 'text',   required: false, visible: true, order: startOrder + 3, isFixed: true },
      { entityType: 'accessory', category, name: 'status',      label: 'Status',        type: 'select', required: true,  visible: true, order: startOrder + 4, isFixed: true, options: ['Available','Assigned','In Repair','Retired','Missing'] },
      { entityType: 'accessory', category, name: 'notes',       label: 'Notes',         type: 'text',   required: false, visible: true, order: startOrder + 5, isFixed: true },
    ];
    const allAccessoryFields = accessoryCategories.flatMap(c => accessoryBase(c, 1));

    await DynamicField.insertMany([...allFixed, ...assetCustom, ...employeeFields, ...allAccessoryFields]);
    console.log('✅ DynamicField defaults seeded');
  } catch (err) {
    console.error('❌ DynamicField seed error:', err.message);
  }
}

async function seedAssetCategoryFields() {
  // No-op: replaced by seedDynamicFields()
}

async function seedAssetCategories() {
  try {
    const { toSlug } = require('./models/AssetCategory');
    // First fix any existing records with null slugs
    const broken = await AssetCategory.find({ $or: [{ slug: null }, { slug: { $exists: false } }] });
    for (const cat of broken) {
      cat.slug = toSlug(cat.name);
      await cat.save();
    }

    const defaults = [
      { name: 'Laptop',          type: 'asset' },
      { name: 'MacBook',         type: 'asset' },
      { name: 'Mac Mini',        type: 'asset' },
      { name: 'iMac',            type: 'asset' },
      { name: 'Other',           type: 'asset' },
      { name: 'Mouse',           type: 'accessory' },
      { name: 'Keyboard',        type: 'accessory' },
      { name: 'Monitor',         type: 'accessory' },
      { name: 'Headset',         type: 'accessory' },
      { name: 'Docking Station', type: 'accessory' },
    ];
    for (const d of defaults) {
      const slug = toSlug(d.name);
      await AssetCategory.findOneAndUpdate(
        { name: d.name },
        { $set: { type: d.type, isActive: true, slug } },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
    console.log('✅ AssetCategory defaults ensured');
  } catch (err) {
    console.error('❌ AssetCategory seed error:', err.message);
  }
}

async function seedEmployeeFields() {
  // No-op: replaced by seedDynamicFields()
}

async function autoReclassify() {
  try {
    const Asset = require('./models/Asset');
    const { ASSET_CATEGORIES, ACCESSORY_CATEGORIES } = require('./routes/asset.routes');
    // Only run if there are records with missing/null type
    const untypedCount = await Asset.countDocuments({ $or: [{ type: { $exists: false } }, { type: null }] });
    if (untypedCount === 0) return;
    console.log(`🔄 Auto-reclassify: ${untypedCount} records missing type — fixing...`);
    await Asset.updateMany({ category: { $in: ASSET_CATEGORIES } },     { $set: { type: 'asset' } });
    await Asset.updateMany({ category: { $in: ACCESSORY_CATEGORIES } }, { $set: { type: 'accessory' } });
    const assets      = await Asset.countDocuments({ type: 'asset' });
    const accessories = await Asset.countDocuments({ type: 'accessory' });
    console.log(`✅ Auto-reclassify complete — assets: ${assets}, accessories: ${accessories}`);
  } catch (err) {
    console.error('❌ Auto-reclassify error:', err.message);
  }
}
// ─── Super Admin Seed ─────────────────────────────────────────────────────────
// Ensures exactly ONE super_admin exists with the hardcoded username.
// Password is read from SUPER_ADMIN_PASSWORD env var.
// This user is NEVER visible to any other role.
async function seedSuperAdmin() {
  try {
    const bcrypt = require('bcrypt');
    const User   = require('./models/User');

    const SUPER_ADMIN_USERNAME = 'sachinforoffice23';
    const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

    if (!SUPER_ADMIN_PASSWORD) {
      console.warn('⚠️  SUPER_ADMIN_PASSWORD not set — skipping super admin seed.');
      return;
    }

    const existing = await User.findOne({ username: SUPER_ADMIN_USERNAME });
    if (existing) {
      // Ensure role is correct in case it was tampered
      if (existing.role !== 'super_admin') {
        await User.findByIdAndUpdate(existing._id, { $set: { role: 'super_admin' } });
        console.log('[seed] 🔧 Fixed super_admin role for sachinforoffice23');
      } else {
        console.log('[seed] ✅ Super admin already exists — skipping');
      }
      return;
    }

    const hashed = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
    await User.create({
      username:     SUPER_ADMIN_USERNAME,
      password:     hashed,
      role:         'super_admin',
      organizationId: null,
      isActive:     true,
    });
    console.log('[seed] ✅ Super admin "sachinforoffice23" created');
  } catch (err) {
    console.error('[seed] ❌ Super admin seed error:', err.message);
  }
}

const connectWithRetry = (attempt = 1, maxAttempts = 5) => {
  mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 50,
    minPoolSize: 5,
    waitQueueTimeoutMS: 10000,
  })
  .then(async () => {
    const dbName = mongoose.connection.db?.databaseName || 'unknown';
    console.log(`✅ MongoDB connected → database: "${dbName}"`);

    // ── Replica set check (production only) ──────────────────────────────────
    // Transactions require a replica set. Standalone MongoDB does not support them.
    // This check prevents silent data integrity failures on bulk imports.
    if (NODE_ENV === 'production') {
      try {
        const info = await mongoose.connection.db.admin().command({ isMaster: 1 });
        if (!info.setName && info.msg !== 'isdbgrid') {
          console.error('❌ MongoDB replica set required in production.');
          console.error('   Standalone instances do not support transactions.');
          console.error('   Use MongoDB Atlas (M10+) or configure a 3-node replica set.');
          process.exit(1);
        }
        console.log(`[db] ✅ Replica set detected: "${info.setName}"`);
      } catch (rsErr) {
        console.error('❌ Replica set check failed:', rsErr.message);
        process.exit(1);
      }
    }

    // NOTE: Cron jobs are NOT started here — they run in the dedicated
    // isomac-cron process. See cron.js and ecosystem.config.js.
    seedSuperAdmin();
    seedDynamicFields();
    seedAssetCategoryFields();
    seedAssetCategories();
    seedEmployeeFields();
    autoReclassify();
  })
  .catch(err => {
    console.error(`❌ MongoDB connection attempt ${attempt} failed: ${err.message}`);
    if (attempt < maxAttempts) {
      const delay = attempt * 2000;
      console.log(`🔄 Retrying in ${delay / 1000}s...`);
      setTimeout(() => connectWithRetry(attempt + 1, maxAttempts), delay);
    } else {
      console.error('❌ All MongoDB connection attempts failed. Exiting.');
      process.exit(1);
    }
  });
};

connectWithRetry();

mongoose.connection.on('disconnected', () => console.warn('🟡 MongoDB disconnected'));
mongoose.connection.on('error', err => console.error('🔴 MongoDB error:', err.message));

// --- Health ---
app.get('/health', async (_req, res) => {
  const dbState  = mongoose.connection.readyState; // 1 = connected
  const mem      = process.memoryUsage();
  const healthy  = dbState === 1;
  res.status(healthy ? 200 : 503).json({
    status:   healthy ? 'ok' : 'degraded',
    uptime:   Math.round(process.uptime()),
    db:       dbState === 1 ? 'connected' : 'disconnected',
    memory: {
      heapUsedMB:  Math.round(mem.heapUsed  / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB:       Math.round(mem.rss       / 1024 / 1024),
    },
    pid:    process.pid,
    worker: process.env.pm_id || 'standalone',
  });
});

// --- Routes ---
app.use('/', require('./routes/auth.routes'));
app.use('/', require('./routes/mfa.routes'));
app.use('/', require('./routes/saml.routes'));
app.use('/inventory', require('./routes/inventory.routes'));
app.use('/assets', require('./routes/asset.routes'));
// /accessories alias — forces type=accessory at request level, not query string
const assetRouter = require('./routes/asset.routes');
app.use('/accessories', (req, _res, next) => {
  req.__forcedType = 'accessory';
  if (req.method === 'POST' || req.method === 'PUT') {
    if (req.body) req.body.type = 'accessory';
  }
  next();
}, assetRouter);
app.use('/assignments', require('./routes/assignment.routes'));
app.use('/maintenance', require('./routes/maintenance.routes'));
app.use('/licenses', require('./routes/license.routes'));
app.use('/audit', require('./routes/audit.routes'));
app.use('/auth/audit-logs', require('./routes/authAudit.routes'));
app.use('/organizations', require('./routes/organization.routes'));
app.use('/tenants',       require('./routes/tenant.routes'));
app.use('/requests', require('./routes/request.routes'));
app.use('/locations', require('./routes/location.routes'));
app.use('/import', require('./routes/import.routes'));
app.use('/alerts', require('./routes/alert.routes'));
app.use('/regions', require('./routes/region.routes'));
app.use('/employees', require('./routes/employee.routes'));
app.use('/employee-fields', require('./routes/employeeField.routes'));
app.use('/asset-category-fields', require('./routes/assetCategoryField.routes'));
app.use('/dynamic-fields', require('./routes/dynamicField.routes'));
app.use('/asset-categories', require('./routes/assetCategory.routes'));
require('./models/EmployeeAssetHistory'); // ensure model is registered
app.use('/', require('./routes/files.routes'));

// --- Serve React SPA ---
const FRONTEND_DIST = path.join(__dirname, '../frontend-react/dist');
app.use(express.static(FRONTEND_DIST));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

// --- Global error handler (must be last) ---
// Sentry captures the error first, then our handler formats the response
app.use(sentryErrorHandler());
app.use(errorHandler);

// --- Start ---
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Server listening at http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`\n🔻 ${signal} received. Shutting down...`);
  server.close(async () => {
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
