const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { getDb } = require('../services/db');
const { addNotification } = require('../services/notifications');

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

const upload = multer({ storage });

// List tasks for current user (or all tasks if admin)
router.get('/tasks', async (req, res) => {
  const { status, from, to } = req.query;
  const params = [];
  const where = [];
  let paramIndex = 1;

  // Admin ise tüm görevleri göster, değilse sadece kendisine atanan görevleri
  if (req.user.role !== 'admin') {
    where.push(`t.assigned_to = $${paramIndex}`);
    params.push(req.user.id);
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

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    SELECT t.*, 
           c.username AS created_username, 
           u.username AS assigned_username,
           COALESCE(t.acil, false)::boolean AS acil
    FROM tasks t
    JOIN users c ON t.created_by = c.id
    LEFT JOIN users u ON t.assigned_to = u.id
    ${whereSql}
    ORDER BY t.deadline NULLS FIRST, t.deadline ASC
  `;

  try {
    const result = await pool.query(sql, params);
    res.render('user/tasks', {
      pageTitle: req.t('userTasks'),
      tasks: result.rows,
      filters: { status, from, to },
      isAdmin: req.user.role === 'admin'
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Task detail
router.get('/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  try {
    // Admin ise tüm görevleri görebilir, değilse sadece kendisine atanan görevleri
    let taskResult;
    if (req.user.role === 'admin') {
      taskResult = await pool.query(
        `SELECT t.*, c.username AS created_username, u.username AS assigned_username
         FROM tasks t
         JOIN users c ON t.created_by = c.id
         LEFT JOIN users u ON t.assigned_to = u.id
         WHERE t.id = $1`,
        [taskId]
      );
    } else {
      taskResult = await pool.query(
        `SELECT t.*, c.username AS created_username, u.username AS assigned_username
         FROM tasks t
         JOIN users c ON t.created_by = c.id
         LEFT JOIN users u ON t.assigned_to = u.id
         WHERE t.id = $1 AND t.assigned_to = $2`,
        [taskId, req.user.id]
      );
    }

    if (taskResult.rows.length === 0) {
      return res.sendStatus(404);
    }

    const task = taskResult.rows[0];
    const filesResult = await pool.query(
      'SELECT * FROM task_files WHERE task_id = $1 ORDER BY uploaded_at DESC',
      [taskId]
    );

    res.render('user/task-detail', {
      pageTitle: task.title,
      task,
      files: filesResult.rows
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Update status + upload evidence + optional note to admin
router.post('/tasks/:id/update', upload.array('attachments', 5), async (req, res) => {
  const taskId = req.params.id;
  const { status, note } = req.body;
  const allowed = ['pending', 'in_progress', 'done'];
  if (!allowed.includes(status)) {
    return res.redirect(`/user/tasks/${taskId}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update task status
    await client.query(
      'UPDATE tasks SET status = $1 WHERE id = $2 AND assigned_to = $3',
      [status, taskId, req.user.id]
    );

    // Save update history
    const updateResult = await client.query(
      'INSERT INTO task_updates (task_id, user_id, status, note, created_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING id',
      [taskId, req.user.id, status, note || null]
    );

    const updateId = updateResult.rows[0]?.id;

    // Build optional message for admins
    const statusText =
      status === 'done'
        ? 'Tamamlandı'
        : status === 'in_progress'
        ? 'Devam ediyor'
        : 'Beklemede';
    const actor = req.user && req.user.username ? req.user.username : 'Personel';
    const baseMessage = `Personel (${actor}) görev durumunu güncelledi (ID: ${taskId}) - Durum: ${statusText}`;
    let fullMessage =
      note && note.trim().length ? `${baseMessage} - Not: ${note.trim()}` : baseMessage;

    const files = req.files || [];
    if (files.length) {
      fullMessage += ` - Ek: ${files.length} dosya yüklendi`;
    }

    // Notify all admins on any status change
    const adminsResult = await client.query('SELECT id FROM users WHERE role = $1', ['admin']);
    for (const admin of adminsResult.rows) {
      await addNotification(admin.id, fullMessage, 'task_update', taskId);
    }

    // Insert files if any
    if (files.length) {
      for (const file of files) {
        await client.query(
          'INSERT INTO task_files (task_id, uploader_id, filename, original_name, mime_type, uploaded_at, update_id) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)',
          [taskId, req.user.id, file.filename, file.originalname, file.mimetype, updateId || null]
        );
      }
    }

    await client.query('COMMIT');
    res.redirect(`/user/tasks/${taskId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating task', err);
    res.sendStatus(500);
  } finally {
    client.release();
  }
});

module.exports = router;
