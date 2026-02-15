const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { getDb } = require('../services/db');
const { addNotification } = require('../services/notifications');
const { sendTaskAssignedEmail } = require('../services/email');

const router = express.Router();
const pool = getDb();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname);
  }
});

// Avatar upload için ayrı storage
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const avatarDir = path.join(__dirname, '..', 'uploads', 'avatars');
    if (!fs.existsSync(avatarDir)) {
      fs.mkdirSync(avatarDir, { recursive: true });
    }
    cb(null, avatarDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'avatar-' + unique + ext);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyaları yüklenebilir!'));
    }
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

// Admin dashboard with filters
router.get('/dashboard', async (req, res) => {
  console.log(`📊 Admin dashboard accessed - user: ${req.user ? req.user.username : 'null'}, sessionId: ${req.sessionID}`);
  const { userId, status, from, to } = req.query;

  const params = [];
  const where = [];
  let paramIndex = 1;

  if (userId) {
    where.push(`t.assigned_to = $${paramIndex}`);
    params.push(userId);
    paramIndex++;
  }
  if (status) {
    where.push(`t.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }
  if (from) {
    where.push(`DATE(t.deadline) >= DATE($${paramIndex})`);
    params.push(from);
    paramIndex++;
  }
  if (to) {
    where.push(`DATE(t.deadline) <= DATE($${paramIndex})`);
    params.push(to);
    paramIndex++;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    SELECT t.*, u.username AS assigned_username, c.username AS created_username
    FROM tasks t
    JOIN users u ON t.assigned_to = u.id
    JOIN users c ON t.created_by = c.id
    ${whereSql}
    ORDER BY t.deadline NULLS FIRST, t.deadline ASC
  `;

  try {
    const usersResult = await pool.query('SELECT id, username FROM users WHERE role = $1 ORDER BY username', ['user']);
    const tasksResult = await pool.query(sql, params);
    
    res.render('admin/dashboard', {
      pageTitle: req.t('adminDashboard'),
      tasks: tasksResult.rows,
      users: usersResult.rows,
      filters: { userId, status, from, to }
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// New staff form + list
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, role, avatar FROM users ORDER BY role DESC, username');
    res.render('admin/users', {
      pageTitle: 'Users',
      users: result.rows,
      error: null
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

router.post('/users', avatarUpload.single('avatar'), async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !password || !role) {
    return res.redirect('/admin/users');
  }
  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const avatarPath = req.file ? `uploads/avatars/${req.file.filename}` : null;
    await pool.query(
      'INSERT INTO users (username, email, password_hash, role, avatar) VALUES ($1, $2, $3, $4, $5)',
      [username, email || null, passwordHash, role, avatarPath]
    );
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/users');
  }
});

// Edit user form
router.get('/users/:id/edit', async (req, res) => {
  const userId = req.params.id;
  try {
    const result = await pool.query('SELECT id, username, email, role, avatar FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.sendStatus(404);
    }
    res.render('admin/user-edit', {
      pageTitle: 'Edit User',
      user: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Update user
router.post('/users/:id', avatarUpload.single('avatar'), async (req, res) => {
  const userId = req.params.id;
  const { username, email, password, role } = req.body;

  if (!username || !role) {
    return res.redirect(`/admin/users/${userId}/edit`);
  }

  try {
    // Eski avatar'ı kontrol et ve yeni avatar varsa güncelle
    let avatarPath = null;
    if (req.file) {
      avatarPath = `uploads/avatars/${req.file.filename}`;
      // Eski avatar'ı sil (opsiyonel)
      const oldUser = await pool.query('SELECT avatar FROM users WHERE id = $1', [userId]);
      if (oldUser.rows[0] && oldUser.rows[0].avatar) {
        const oldAvatarPath = path.join(__dirname, '..', oldUser.rows[0].avatar);
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
        }
      }
    } else {
      // Avatar değiştirilmediyse mevcut avatar'ı koru
      const currentUser = await pool.query('SELECT avatar FROM users WHERE id = $1', [userId]);
      avatarPath = currentUser.rows[0]?.avatar || null;
    }

    if (password && password.trim().length) {
      const passwordHash = bcrypt.hashSync(password, 10);
      await pool.query(
        'UPDATE users SET username = $1, email = $2, role = $3, password_hash = $4, avatar = $5 WHERE id = $6',
        [username, email || null, role, passwordHash, avatarPath, userId]
      );
    } else {
      await pool.query(
        'UPDATE users SET username = $1, email = $2, role = $3, avatar = $4 WHERE id = $5',
        [username, email || null, role, avatarPath, userId]
      );
    }
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/users');
  }
});

// Create task form
router.get('/tasks/new', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username FROM users WHERE role = $1 ORDER BY username', ['user']);
    res.render('admin/task-form', {
      pageTitle: req.t('createTask'),
      users: result.rows
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Create task handler
router.post('/tasks', upload.array('attachments', 5), async (req, res) => {
  const { title, description, deadline, assigned_to } = req.body;
  const files = req.files || [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert task
    const taskResult = await client.query(
      'INSERT INTO tasks (title, description, deadline, status, assigned_to, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING id',
      [title, description, deadline || null, 'pending', assigned_to, req.user.id]
    );

    const taskId = taskResult.rows[0].id;

    // Insert files if any
    for (const file of files) {
      await client.query(
        'INSERT INTO task_files (task_id, uploader_id, filename, original_name, mime_type, uploaded_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [taskId, req.user.id, file.filename, file.originalname, file.mimetype]
      );
    }

    // Notification for assigned user
    const actor = req.user && req.user.username ? req.user.username : 'Admin';
    await addNotification(
      Number(assigned_to),
      `Yeni görev atandı (by ${actor}): ${title}`,
      'task_assigned',
      taskId
    );

      // Try to send email if user has email address
      const userResult = await client.query('SELECT email FROM users WHERE id = $1', [assigned_to]);
      if (userResult.rows.length > 0 && userResult.rows[0].email) {
        sendTaskAssignedEmail(userResult.rows[0].email, title, deadline || null, taskId);
      }

    await client.query('COMMIT');
    res.redirect('/admin/dashboard');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.sendStatus(500);
  } finally {
    client.release();
  }
});

// Task detail
router.get('/tasks/:id', async (req, res) => {
  const taskId = req.params.id;

  try {
    const taskResult = await pool.query(
      `SELECT t.*, u.username AS assigned_username, c.username AS created_username
       FROM tasks t
       JOIN users u ON t.assigned_to = u.id
       JOIN users c ON t.created_by = c.id
       WHERE t.id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.sendStatus(404);
    }

    const task = taskResult.rows[0];
    const filesResult = await pool.query(
      'SELECT * FROM task_files WHERE task_id = $1 ORDER BY uploaded_at DESC',
      [taskId]
    );

    const updatesResult = await pool.query(
      `SELECT tu.*, u.username
       FROM task_updates tu
       JOIN users u ON tu.user_id = u.id
       WHERE tu.task_id = $1
       ORDER BY tu.created_at DESC`,
      [taskId]
    );

    res.render('admin/task-detail', {
      pageTitle: task.title,
      task,
      files: filesResult.rows,
      updates: updatesResult.rows
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Edit task form
router.get('/tasks/:id/edit', async (req, res) => {
  const taskId = req.params.id;

  try {
    const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskResult.rows.length === 0) {
      return res.sendStatus(404);
    }

    const usersResult = await pool.query('SELECT id, username FROM users WHERE role = $1 ORDER BY username', ['user']);
    
    res.render('admin/task-form', {
      pageTitle: 'Edit Task',
      users: usersResult.rows,
      task: taskResult.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Update task main fields
router.post('/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  const { title, description, deadline, assigned_to } = req.body;

  try {
    await pool.query(
      'UPDATE tasks SET title = $1, description = $2, deadline = $3, assigned_to = $4 WHERE id = $5',
      [title, description, deadline || null, assigned_to, taskId]
    );
    res.redirect(`/admin/tasks/${taskId}`);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Update task status (admin)
router.post('/tasks/:id/status', async (req, res) => {
  const taskId = req.params.id;
  const { status } = req.body;
  const allowed = ['pending', 'in_progress', 'done'];
  if (!allowed.includes(status)) {
    return res.redirect(`/admin/tasks/${taskId}`);
  }

  try {
    await pool.query('UPDATE tasks SET status = $1 WHERE id = $2', [status, taskId]);
    
    // Log admin status update
    await pool.query(
      'INSERT INTO task_updates (task_id, user_id, status, note, created_at) VALUES ($1, $2, $3, NULL, CURRENT_TIMESTAMP)',
      [taskId, req.user.id, status]
    );

    res.redirect(`/admin/tasks/${taskId}`);
  } catch (err) {
    console.error('Error updating task status', err);
    res.redirect(`/admin/tasks/${taskId}`);
  }
});

// Delete task (admin only)
router.post('/tasks/:id/delete', async (req, res) => {
  const taskId = req.params.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Foreign keys with ON DELETE CASCADE should handle these, but being explicit
    await client.query('DELETE FROM task_files WHERE task_id = $1', [taskId]);
    await client.query('DELETE FROM task_updates WHERE task_id = $1', [taskId]);
    await client.query('DELETE FROM notifications WHERE related_task_id = $1', [taskId]);
    await client.query('DELETE FROM tasks WHERE id = $1', [taskId]);

    await client.query('COMMIT');
    res.redirect('/admin/dashboard');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting task', err);
    res.redirect('/admin/dashboard');
  } finally {
    client.release();
  }
});

module.exports = router;
