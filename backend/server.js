const path = require('path');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

const { initDb } = require('./services/db');
const { attachUserToRequest, ensureAuthenticated, ensureRole } = require('./services/auth-middleware');
const { getI18nMiddleware } = require('./services/i18n');
const { attachNotificationCount } = require('./services/notifications');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const notificationRoutes = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database (SQLite)
initDb();

// View engine + layout
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Static assets
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'super-secret-demo-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: false, // Render'da HTTPS var ama cookie secure false yapıyoruz (test için)
    httpOnly: true,
    sameSite: false // Cross-site cookie gönderimi için false (Render proxy için)
  }
};

// Debug: Session config
console.log('🔍 Session Config:');
console.log('  NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('  Cookie secure:', sessionConfig.cookie.secure ? '✅ Yes (HTTPS only)' : '❌ No (HTTP allowed)');
console.log('  SESSION_SECRET:', process.env.SESSION_SECRET ? '✅ Set' : '❌ Not set (using default)');

app.use(session(sessionConfig));

// Attach user + language handling + notifications
app.use(attachUserToRequest);
app.use(getI18nMiddleware());
app.use(attachNotificationCount);

// Language switcher
app.get('/lang/:code', (req, res) => {
  const { code } = req.params;
  if (code === 'en' || code === 'ar' || code === 'tr') {
    req.session.lang = code;
  }
  const back = req.get('Referer') || '/';
  res.redirect(back);
});

// Routes
app.use('/', authRoutes);
app.use('/notifications', ensureAuthenticated, notificationRoutes);
app.use('/admin', ensureAuthenticated, ensureRole('admin'), adminRoutes);
app.use('/user', ensureAuthenticated, ensureRole('user'), userRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('errors/404', {
    pageTitle: 'Not Found',
    t: req.t,
    lang: req.lang,
    dir: req.dir,
    user: req.user
  });
});

app.listen(PORT, () => {
  console.log(`Task manager app running on http://localhost:${PORT}`);
});


