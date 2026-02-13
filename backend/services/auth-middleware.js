const { getDb } = require('./db');

async function attachUserToRequest(req, res, next) {
  const userId = req.session.userId;
  if (!userId) {
    req.user = null;
    return next();
  }

  try {
    const pool = getDb();
    const result = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [userId]);
    req.user = result.rows[0] || null;
    next();
  } catch (err) {
    console.error('Error loading user from session', err);
    req.user = null;
    next();
  }
}

function ensureAuthenticated(req, res, next) {
  if (!req.user) {
    return res.redirect('/login');
  }
  next();
}

function ensureRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
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
