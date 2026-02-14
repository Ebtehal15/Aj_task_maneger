const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../services/db');

const router = express.Router();

// Shared login form (admin or user)
router.get('/login', (req, res) => {
  if (req.user) {
    if (req.user.role === 'admin') return res.redirect('/admin/dashboard');
    return res.redirect('/user/tasks');
  }
  res.render('auth/login', {
    pageTitle: req.t('loginTitle'),
    error: null,
    targetRole: null
  });
});

// Handle login (admin or user)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
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

    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      console.log(`❌ Invalid password for user: ${username}`);
      return res.render('auth/login', {
        pageTitle: req.t('loginTitle'),
        error: req.t('invalidCredentials'),
        targetRole: null
      });
    }

    console.log(`✅ Login successful for user: ${username} (role: ${user.role})`);
    req.session.userId = user.id;
    console.log(`💾 Setting session userId: ${user.id}, sessionId: ${req.sessionID}`);
    
    // Session'ı kaydet ve redirect yap
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error saving session:', err);
        return res.render('auth/login', {
          pageTitle: req.t('loginTitle'),
          error: 'Session error',
          targetRole: null
        });
      }
      console.log(`✅ Session saved successfully for user: ${username}, sessionId: ${req.sessionID}`);
      
      // Redirect yapmadan önce response'u commit et
      // Bu, cookie'nin tarayıcıya gönderilmesini garanti eder
      if (user.role === 'admin') {
        console.log(`🔄 Redirecting to /admin/dashboard with sessionId: ${req.sessionID}`);
        return res.redirect(302, '/admin/dashboard');
      }
      console.log(`🔄 Redirecting to /user/tasks with sessionId: ${req.sessionID}`);
      return res.redirect(302, '/user/tasks');
    });
  } catch (err) {
    console.error('❌ Login error', err);
    return res.render('auth/login', {
      pageTitle: req.t('loginTitle'),
      error: 'Server error',
      targetRole: null
    });
  }
});

// Dedicated user login URL – only allows logging in as normal user
router.get('/user-login', (req, res) => {
  if (req.user) {
    if (req.user.role === 'admin') return res.redirect('/admin/dashboard');
    return res.redirect('/user/tasks');
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
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
