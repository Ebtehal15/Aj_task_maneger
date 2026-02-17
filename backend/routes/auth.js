const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../services/db');

const router = express.Router();

// Home page - redirect to dashboard if logged in, otherwise to login
router.get('/', (req, res) => {
  try {
    console.log('📍 Root route accessed');
    console.log('  req.user:', req.user ? `${req.user.username} (${req.user.role})` : 'null');
    console.log('  sessionId:', req.sessionID);
    
    if (req.user) {
      // User is logged in, redirect to their dashboard
      if (req.user.role === 'admin') {
        console.log('  → Redirecting to /admin/dashboard');
        return res.redirect('/admin/dashboard');
      } else {
        console.log('  → Redirecting to /user/tasks');
        return res.redirect('/user/tasks');
      }
    } else {
      // User is not logged in, redirect to login
      console.log('  → Redirecting to /login');
      return res.redirect('/login');
    }
  } catch (error) {
    console.error('❌ Error in home route:', error);
    console.error('  Stack:', error.stack);
    return res.redirect('/login');
  }
});

// Shared login form (admin or user)
router.get('/login', (req, res) => {
  try {
    console.log('📍 /login route accessed');
    console.log('  req.user:', req.user ? `${req.user.username} (${req.user.role})` : 'null');
    
  if (req.user) {
      // User is already logged in, redirect to their dashboard
      console.log('  → User already logged in, redirecting to dashboard');
      if (req.user.role === 'admin') {
        return res.redirect('/admin/dashboard');
      } else {
    return res.redirect('/user/tasks');
  }
    }
    console.log('  → Rendering login page');
  res.render('auth/login', {
    pageTitle: req.t('loginTitle'),
    error: null,
    targetRole: null
  });
  } catch (error) {
    console.error('❌ Error in /login route:', error);
    console.error('  Stack:', error.stack);
    res.status(500).render('errors/404', {
      pageTitle: 'Error',
      t: req.t,
      lang: req.lang,
      dir: req.dir,
      user: req.user
    });
  }
});

// Handle login (admin or user)
router.post('/login', async (req, res) => {
  console.log('🔐 POST /login route accessed');
  console.log('  Request body:', { username: req.body.username, password: req.body.password ? '***' : 'missing' });
  console.log('  Session ID:', req.sessionID);
  
  const { username, password } = req.body;
  
  // Validate input
  if (!username || !password) {
    console.log('❌ Missing username or password');
    return res.render('auth/login', {
      pageTitle: req.t('loginTitle'),
      error: req.t('invalidCredentials'),
      targetRole: null
    });
  }
  
  const pool = getDb();

  console.log(`🔐 Login attempt for username: ${username}`);

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user) {
      console.log(`❌ User not found: ${username}`);
      return res.render('auth/login', {
        pageTitle: req.t('loginTitle'),
        error: req.t('invalidCredentials'),
        targetRole: null
      });
    }

    console.log(`✅ User found: ${user.username} (role: ${user.role})`);
    
    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      console.log(`❌ Invalid password for user: ${username}`);
      return res.render('auth/login', {
        pageTitle: req.t('loginTitle'),
        error: req.t('invalidCredentials'),
        targetRole: null
      });
    }

    console.log(`✅ Password match successful for user: ${username}`);
    console.log(`💾 Setting session userId: ${user.id}, sessionId: ${req.sessionID}`);
    console.log(`  Current cookies: ${req.headers.cookie || 'none'}`);
    
    // Set session data
    req.session.userId = user.id;
    
    // Save session and redirect
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error saving session:', err);
        console.error('  Error details:', {
          message: err.message,
          code: err.code,
          stack: err.stack
        });
        return res.render('auth/login', {
          pageTitle: req.t('loginTitle'),
          error: 'Session error - please try again',
          targetRole: null
        });
      }
      
      console.log(`✅ Session saved successfully for user: ${username}`);
      console.log(`  Session ID: ${req.sessionID}`);
      console.log(`  Session userId: ${req.session.userId}`);
      console.log(`  Response will include Set-Cookie header`);
      
      // Redirect based on user role
    if (user.role === 'admin') {
        console.log(`🔄 Redirecting admin to /admin/dashboard with sessionId: ${req.sessionID}`);
      return res.redirect('/admin/dashboard');
      } else {
        console.log(`🔄 Redirecting user to /user/tasks with sessionId: ${req.sessionID}`);
    return res.redirect('/user/tasks');
      }
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    console.error('  Error details:', {
      message: err.message,
      code: err.code,
      stack: err.stack
    });
    return res.render('auth/login', {
      pageTitle: req.t('loginTitle'),
      error: 'Server error - please try again',
      targetRole: null
  });
  }
});

// Dedicated user login URL – only allows logging in as normal user
router.get('/user-login', (req, res) => {
  if (req.user) {
    if (req.user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    } else {
    return res.redirect('/user/tasks');
    }
  }
  res.render('auth/login', {
    pageTitle: req.t('loginTitle'),
    error: null,
    targetRole: 'user'
  });
});

router.post('/user-login', async (req, res) => {
  const { username, password } = req.body;
  const pool = getDb();

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1 AND role = $2', [username, 'user']);
    const user = result.rows[0];

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.render('auth/login', {
        pageTitle: req.t('loginTitle'),
        error: req.t('invalidCredentials'),
        targetRole: 'user'
      });
    }

    req.session.userId = user.id;
    return res.redirect('/user/tasks');
  } catch (err) {
    console.error('User login error', err);
    return res.render('auth/login', {
      pageTitle: req.t('loginTitle'),
      error: 'Server error',
      targetRole: 'user'
  });
  }
});

// Logout
// Language switcher
router.get('/lang/:code', (req, res) => {
  const { code } = req.params;
  if (code === 'en' || code === 'ar' || code === 'tr') {
    req.session.lang = code;
  }
  const back = req.get('Referer') || '/';
  res.redirect(back);
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
