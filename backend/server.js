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
const sessionPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'task_manager',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  // Ensure UTF-8 encoding for Arabic/English text support
  client_encoding: 'UTF8'
});

app.use(
  session({
    store: new pgSession({
      pool: sessionPool,
      tableName: 'session'
    }),
    secret: process.env.SESSION_SECRET || 'super-secret-demo-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      secure: process.env.NODE_ENV === 'production' // HTTPS only in production
    }
  })
);

// Attach user + language handling + notifications
app.use(attachUserToRequest);
app.use(getI18nMiddleware());
app.use(attachNotificationCount);

// Language switcher
app.get('/lang/:code', (req, res) => {
  const { code } = req.params;
  if (code === 'en' || code === 'ar') {
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

// Home redirect
app.get('/', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  if (req.user.role === 'admin') {
    return res.redirect('/admin/dashboard');
  }
  return res.redirect('/user/tasks');
});

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


