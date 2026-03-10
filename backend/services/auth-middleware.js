const { getDb } = require('./db');

async function attachUserToRequest(req, res, next) {
  const userId = req.session?.userId;
  const sessionId = req.sessionID;
  
  console.log(`🔍 attachUserToRequest - sessionId: ${sessionId}, userId: ${userId || 'null'}`);
  
  if (!userId) {
    console.log(`⚠️  No userId in session for sessionId: ${sessionId}`);
    req.user = null;
    return next();
  }

        try {
          const pool = getDb();
          const result = await pool.query('SELECT id, username, role, avatar FROM users WHERE id = $1', [userId]);
          req.user = result.rows[0] || null;
    if (!req.user) {
      console.log(`⚠️  User not found in database for session userId: ${userId}`);
    } else {
      console.log(`✅ User loaded from session: ${req.user.username} (role: ${req.user.role})`);
    }
    next();
  } catch (err) {
    console.error('❌ Error loading user from session', err);
    req.user = null;
    next();
  }
}

function ensureAuthenticated(req, res, next) {
  console.log(`🔒 ensureAuthenticated check - user: ${req.user ? req.user.username : 'null'}, path: ${req.path}`);
  if (!req.user) {
    console.log(`❌ Authentication failed - redirecting to /login`);
    return res.redirect('/login');
  }
  console.log(`✅ Authentication successful for user: ${req.user.username}`);
  next();
}

function ensureRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.redirect('/login');
    }
    // Eğer role 'user' ise ve kullanıcının role'ü 'user', 'admin' veya undefined/null ise izin ver
    if (role === 'user' && (!req.user.role || req.user.role === 'user' || req.user.role === 'admin')) {
      return next();
    }
    // Eğer role 'admin' ise ve kullanıcının role'ü 'admin' ise izin ver
    if (role === 'admin' && req.user.role === 'admin') {
      return next();
    }
    // super_admin veya system_admin (System Administrator - sadece kod/DB ile atanır)
    if (role === 'super_admin' && (req.user.role === 'super_admin' || req.user.role === 'system_admin')) {
      return next();
    }
    if (role === 'system_admin' && req.user.role === 'system_admin') {
      return next();
    }
    // Diğer durumlarda role kontrolü yap
    if (req.user.role !== role) {
      return res.status(403).render('errors/403', {
        pageTitle: 'Forbidden',
        t: req.t,
        lang: req.lang,
        dir: req.dir,
        user: req.user
      });
    }
    next();
  };
}

module.exports = {
  attachUserToRequest,
  ensureAuthenticated,
  ensureRole
};
