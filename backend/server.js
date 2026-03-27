// Set timezone to Turkey (Europe/Istanbul) for the entire Node.js process
// This ensures all Date operations use Turkey timezone
process.env.TZ = 'Europe/Istanbul';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

const { initDb } = require('./services/db');
const { getUploadsDir } = require('./services/uploadsPath');
const { attachUserToRequest, ensureAuthenticated, ensureRole } = require('./services/auth-middleware');
const { getI18nMiddleware } = require('./services/i18n');
const { attachNotificationCount } = require('./services/notifications');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const creatorRoutes = require('./routes/creator');
const notificationRoutes = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Debug: Log environment info
console.log('🚀 Starting application...');
console.log('📋 Environment Info:');
console.log('  NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('  PORT:', PORT);
console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set (masked)' : '❌ Not set');
console.log('  DB_SSL:', process.env.DB_SSL || 'not set');
console.log('  SESSION_SECRET:', process.env.SESSION_SECRET ? '✅ Set' : '❌ Not set (using default)');

function parseSessionMaxAgeMinutes() {
  const raw = process.env.SESSION_MAX_AGE_MINUTES;
  if (raw === undefined || String(raw).trim() === '') return 20;
  const n = parseInt(String(raw).trim(), 10);
  if (Number.isNaN(n) || n < 1) return 20;
  if (n > 24 * 60) return 24 * 60;
  return n;
}

const SESSION_MAX_AGE_MINUTES = parseSessionMaxAgeMinutes();
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_MINUTES * 60 * 1000;

console.log('  SESSION_MAX_AGE_MINUTES:', process.env.SESSION_MAX_AGE_MINUTES ? SESSION_MAX_AGE_MINUTES : `${SESSION_MAX_AGE_MINUTES} (default)`);

// Initialize database (SQLite)
initDb();

// View engine + layout
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Trust proxy (Render/NGINX) so secure cookies work correctly in production
if (IS_PROD) {
  app.set('trust proxy', 1);
}

// Static assets - must come before routes to avoid conflicts
app.use('/public', express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true
}));
app.use('/uploads', express.static(getUploadsDir(), {
  maxAge: '1d',
  etag: true
}));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// HTTP verbs like PUT/DELETE via forms
app.use(methodOverride('_method'));

// Session config (PostgreSQL store)
// Render'da DATABASE_URL kullanılıyorsa onu parse et
console.log('🔍 Session Pool Config Check:');
console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Not set');

let sessionPoolConfig;
if (process.env.DATABASE_URL) {
  // DATABASE_URL varsa, içeriğini kontrol et (şifreyi gizle)
  const urlForLog = process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@');
  console.log('  DATABASE_URL (masked):', urlForLog);
  console.log('  DATABASE_URL includes render.com:', process.env.DATABASE_URL.includes('render.com') ? '✅ Yes' : '❌ No');
  console.log('  DATABASE_URL includes postgresql://:', process.env.DATABASE_URL.startsWith('postgresql://') ? '✅ Yes' : '❌ No');
  console.log('  DATABASE_URL includes port:', process.env.DATABASE_URL.includes(':5432') ? '✅ Yes' : '❌ No');
  
  console.log('✅ Session Pool: Using DATABASE_URL connection string');
  const sslEnabled = process.env.DB_SSL === 'true' || process.env.DATABASE_URL.includes('render.com');
  console.log('  SSL enabled:', sslEnabled ? '✅ Yes' : '❌ No');
  sessionPoolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    client_encoding: 'UTF8'
  };
} else {
  console.log('  DB_HOST:', process.env.DB_HOST || '❌ Not set (using default: localhost)');
  console.log('  DB_PORT:', process.env.DB_PORT || '❌ Not set (using default: 5432)');
  console.log('  DB_NAME:', process.env.DB_NAME || '❌ Not set (using default: task_manager)');
  console.log('  DB_USER:', process.env.DB_USER || '❌ Not set (using default: postgres)');
  console.log('  DB_PASSWORD:', process.env.DB_PASSWORD ? '✅ Set' : '❌ Not set (using default)');
  console.log('  DB_SSL:', process.env.DB_SSL || '❌ Not set');
  
  console.log('⚠️  Session Pool: Using individual DB environment variables (or defaults)');
  sessionPoolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'task_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    client_encoding: 'UTF8'
  };
  console.log('📝 Session Pool connecting to:', {
    host: sessionPoolConfig.host,
    port: sessionPoolConfig.port,
    database: sessionPoolConfig.database,
    user: sessionPoolConfig.user,
    ssl: sessionPoolConfig.ssl ? 'enabled' : 'disabled'
  });
}

const sessionPool = new Pool(sessionPoolConfig);

const sessionConfig = {
  store: new pgSession({
    pool: sessionPool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'super-secret-demo-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  rolling: true, // Her istekte cookie süresini yenile (hareketsizlikte SESSION_MAX_AGE_MINUTES sonra düşer)
  name: 'connect.sid', // Explicit session cookie name
  proxy: IS_PROD,
  cookie: {
    maxAge: SESSION_MAX_AGE_MS,
    // In production use secure cookies (requires trust proxy). In local dev allow HTTP.
    secure: IS_PROD,
    httpOnly: true,
    sameSite: 'lax', // Lax for cross-site compatibility
    path: '/' // Ensure cookie is sent for all paths
  }
};

// Debug: Session config
console.log('🔍 Session Config:');
console.log('  NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('  Cookie secure:', sessionConfig.cookie.secure ? '✅ Yes (HTTPS only)' : '❌ No (HTTP allowed)');
console.log('  Session maxAge:', SESSION_MAX_AGE_MINUTES, 'min (rolling), env SESSION_MAX_AGE_MINUTES');
console.log('  SESSION_SECRET:', process.env.SESSION_SECRET ? '✅ Set' : '❌ Not set (using default)');

app.use(session(sessionConfig));

// Attach user + language handling + notifications (must be before routes)
app.use(attachUserToRequest);
app.use(getI18nMiddleware());
app.use(attachNotificationCount);

// Service worker file for PWA (must be at root scope, before static files)
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

// Manifest file for PWA (must be at root scope, before static files)
app.get('/manifest.json', (req, res) => {
  const manifestPath = path.join(__dirname, 'public', 'manifest.json');
  const fs = require('fs');
  
  // Read file synchronously to ensure it's loaded
  try {
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    // Validate JSON
    JSON.parse(manifestContent);
    
    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(manifestContent);
  } catch (err) {
    console.error('Error reading manifest.json:', err);
    res.status(500).json({ error: 'Failed to load manifest', details: err.message });
  }
});

// Route logging middleware (for debugging)
app.use((req, res, next) => {
  console.log(`📍 [${req.method}] ${req.path} - User: ${req.user ? req.user.username : 'anonymous'}`);
  next();
});

// Public routes (no authentication required)
app.use('/', authRoutes);

// Protected routes (authentication required)
app.use('/notifications', ensureAuthenticated, notificationRoutes);
app.use('/admin', ensureAuthenticated, ensureRole('super_admin'), adminRoutes);
app.use('/user', ensureAuthenticated, ensureRole('user'), userRoutes);
app.use('/creator', ensureAuthenticated, ensureRole('admin'), creatorRoutes);

// 404 handler (must be last, after all routes)
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.path}`);
  let dashboardUrl = '/';
  if (req.user) {
    if (req.user.role === 'super_admin' || req.user.role === 'system_admin') dashboardUrl = '/admin/dashboard';
    else if (req.user.role === 'admin') dashboardUrl = '/creator/tasks';
    else dashboardUrl = '/user/tasks';
  }
  res.status(404).render('errors/404', {
    pageTitle: 'Not Found',
    t: req.t,
    lang: req.lang,
    dir: req.dir,
    user: req.user,
    dashboardUrl
  });
});

// Global error handler (must be last)
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  console.error('Stack:', err.stack);
  let dashboardUrl = '/';
  if (req.user) {
    if (req.user.role === 'super_admin' || req.user.role === 'system_admin') dashboardUrl = '/admin/dashboard';
    else if (req.user.role === 'admin') dashboardUrl = '/creator/tasks';
    else dashboardUrl = '/user/tasks';
  }
  res.status(err.status || 500).render('errors/404', {
    pageTitle: 'Error',
    t: req.t || ((key) => key),
    lang: req.lang || 'ar',
    dir: req.dir || 'rtl',
    user: req.user || null,
    dashboardUrl
  });
});

// Start server with database connection test (non-blocking)
async function startServer() {
  try {
    // Initialize database pool (non-blocking)
    console.log('🔍 Initializing database...');
    const pool = initDb();
    console.log('✅ Database pool initialized');
    
    // Test database connection (non-blocking, don't fail if it fails)
    pool.connect()
      .then((testClient) => {
        return testClient.query('SELECT NOW()')
          .then(() => {
            testClient.release();
            console.log('✅ Database connection test successful');
          })
          .catch((err) => {
            testClient.release();
            console.error('⚠️  Database connection test failed (will retry on first request):', err.message);
          });
      })
      .catch((err) => {
        console.error('⚠️  Database connection test failed (will retry on first request):', err.message);
      });
    
    // Start server regardless of database connection status
    // Database will be retried on first request
    console.log(`🚀 Starting server on port ${PORT}...`);
    
    // Use 0.0.0.0 to listen on all interfaces (works for both localhost and Render)
    const host = '0.0.0.0';
    
    app.listen(PORT, host, () => {
      console.log(`✅ Task manager app running on http://${host}:${PORT}`);
      console.log(`🌐 Server is ready to accept connections`);
      console.log(`📝 Note: Database connection will be tested on first request`);
      console.log(`🔗 Local access: http://localhost:${PORT}`);
      console.log(`🔗 Network access: http://127.0.0.1:${PORT}`);
      
      // Additional info for troubleshooting
      if (process.env.NODE_ENV !== 'production') {
        console.log(`⚠️  Development mode - using default SESSION_SECRET`);
        console.log(`⚠️  Set NODE_ENV=production and SESSION_SECRET for production`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    // Don't exit - let Render handle it
    // But log the error so we can see it in logs
  }
}

// Handle uncaught errors (log but don't crash immediately)
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Log but don't exit - Render will restart if needed
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Log but don't exit - Render will restart if needed
});

// Start the server
startServer();


