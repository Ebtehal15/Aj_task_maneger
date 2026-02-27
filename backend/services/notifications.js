const { getDb } = require('./db');
const { sendNotificationEmail } = require('./email');

async function addNotification(userId, message, type = null, relatedTaskId = null) {
  try {
    const pool = getDb();
    await pool.query(
      'INSERT INTO notifications (user_id, message, type, related_task_id, is_read, created_at) VALUES ($1, $2, $3, $4, FALSE, CURRENT_TIMESTAMP)',
      [userId, message, type, relatedTaskId]
    );

    // Email gönder (eğer kullanıcının email'i varsa)
    // Not: Görev atama bildirimlerinde (type === 'task_assigned') email zaten
    // admin routes içinde sendTaskAssignedEmail ile gönderiliyor.
    // Aynı kullanıcıya iki mail gitmemesi için burada task_assigned türünü atlıyoruz.
    if (type !== 'task_assigned') {
      try {
        const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length > 0 && userResult.rows[0].email) {
          const userEmail = userResult.rows[0].email.trim();
          if (userEmail) {
            console.log(`Sending notification email to user ${userId} (${userEmail})`);
            sendNotificationEmail(userEmail, message, relatedTaskId);
          } else {
            console.log(`User ${userId} has no email address`);
          }
        } else {
          console.log(`User ${userId} not found or has no email address`);
        }
      } catch (emailErr) {
        console.error('Error sending notification email', emailErr);
        // Email hatası bildirim eklemeyi engellemez
      }
    }
  } catch (err) {
    console.error('Error inserting notification', err);
  }
}

async function getUnreadForUser(userId) {
  try {
    const pool = getDb();
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND is_read = FALSE ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  } catch (err) {
    console.error('Error getting unread notifications', err);
    return [];
  }
}

async function getAllForUser(userId) {
  try {
    const pool = getDb();
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  } catch (err) {
    console.error('Error getting all notifications', err);
    return [];
  }
}

async function markAllReadForUser(userId) {
  try {
    const pool = getDb();
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [userId]);
  } catch (err) {
    console.error('Error marking notifications as read', err);
    throw err;
  }
}

async function attachNotificationCount(req, res, next) {
  try {
    if (!req.user) {
      res.locals.unreadNotifications = 0;
      return next();
    }
    const pool = getDb();
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [req.user.id]
    );
    res.locals.unreadNotifications = parseInt(result.rows[0].count) || 0;
  } catch (err) {
    console.error('⚠️  Error loading notification count (non-fatal):', err.message);
    res.locals.unreadNotifications = 0;
  }
  next();
}

module.exports = {
  addNotification,
  getUnreadForUser,
  getAllForUser,
  markAllReadForUser,
  attachNotificationCount
};
