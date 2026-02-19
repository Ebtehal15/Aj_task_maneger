const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { getDb } = require('../services/db');
const { addNotification } = require('../services/notifications');
const { streamTaskPdf } = require('../services/pdfHelper');
const { translateText } = require('../services/translate');

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
    // Preserve original filename encoding
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, unique + '-' + originalName);
  }
});

const upload = multer({ storage });

// List tasks for current user (or all tasks if admin)
router.get('/tasks', async (req, res) => {
  const { status, from, to } = req.query;
  const params = [];
  const where = [];
  let paramIndex = 1;

  // Super admin ise tüm görevleri göster, değilse sadece kendisine atanan görevleri
  if (req.user.role !== 'super_admin') {
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
           ks.username AS konu_sorumlusu_username,
           COALESCE(t.acil, false)::boolean AS acil
    FROM tasks t
    JOIN users c ON t.created_by = c.id
    LEFT JOIN users u ON t.assigned_to = u.id
    LEFT JOIN users ks ON (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = ks.id::text)
    ${whereSql}
    ORDER BY t.created_at DESC
  `;

  try {
    const result = await pool.query(sql, params);
    res.render('user/tasks', {
      pageTitle: req.t('userTasks'),
      tasks: result.rows,
      filters: { status, from, to },
      isAdmin: req.user.role === 'super_admin'
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Task detail - accessible to all involved users (assigned_to, sorumlu_2, sorumlu_3, konu_sorumlusu)
router.get('/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  const userId = req.user.id;
  try {
    // Admin ise tüm görevleri görebilir, değilse tüm sorumlular görebilir (assigned_to, sorumlu_2, sorumlu_3, konu_sorumlusu)
    let taskResult;
    if (req.user.role === 'super_admin') {
      taskResult = await pool.query(
        `SELECT t.*, c.username AS created_username, u.username AS assigned_username
         FROM tasks t
         JOIN users c ON t.created_by = c.id
         LEFT JOIN users u ON t.assigned_to = u.id
         WHERE t.id = $1`,
        [taskId]
      );
    } else {
      // Tüm sorumlular görebilir: assigned_to, sorumlu_2, sorumlu_3, konu_sorumlusu
      taskResult = await pool.query(
        `SELECT t.*, c.username AS created_username, u.username AS assigned_username
         FROM tasks t
         JOIN users c ON t.created_by = c.id
         LEFT JOIN users u ON t.assigned_to = u.id
         WHERE t.id = $1 
           AND (t.assigned_to = $2 
                OR t.sorumlu_2 = $2 
                OR t.sorumlu_3 = $2 
                OR t.konu_sorumlusu::text = $2::text)`,
        [taskId, userId]
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

// Task detail PDF for normal users (only if they are involved in the task)
router.get('/tasks/:id/pdf', async (req, res) => {
  const taskId = req.params.id;
  const userId = req.user.id;

  try {
    const taskResult = await pool.query(
      `SELECT t.*,
              c.username  AS created_username,
              u.username  AS assigned_username,
              u2.username AS sorumlu_2_username,
              u3.username AS sorumlu_3_username,
              ks.username AS konu_sorumlusu_username
       FROM tasks t
       JOIN users c  ON t.created_by = c.id
       LEFT JOIN users u  ON t.assigned_to = u.id
       LEFT JOIN users u2 ON t.sorumlu_2 = u2.id
       LEFT JOIN users u3 ON t.sorumlu_3 = u3.id
       LEFT JOIN users ks ON (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = ks.id::text)
       WHERE t.id = $1
         AND (t.assigned_to = $2 
              OR t.sorumlu_2 = $2 
              OR t.sorumlu_3 = $2 
              OR t.konu_sorumlusu::text = $2::text)`,
      [taskId, userId]
    );

    if (!taskResult.rows.length) {
      return res.sendStatus(404);
    }

    const task = taskResult.rows[0];

    const updatesResult = await pool.query(
      `SELECT tu.*, u.username
       FROM task_updates tu
       JOIN users u ON tu.user_id = u.id
       WHERE tu.task_id = $1
       ORDER BY tu.created_at DESC`,
      [taskId]
    );

    const filesResult = await pool.query(
      'SELECT filename, original_name FROM task_files WHERE task_id = $1 ORDER BY uploaded_at DESC',
      [taskId]
    );

    streamTaskPdf({
      task,
      updates: updatesResult.rows,
      files: filesResult.rows,
      req,
      res,
    });
  } catch (err) {
    console.error('Error generating user task PDF:', err);
    res.sendStatus(500);
  }
});

// Update status + upload evidence + optional note to admin
router.post('/tasks/:id/update', upload.array('attachments', 20), async (req, res) => {
  const taskId = req.params.id;
  const { status, note, completed_at } = req.body;
  const allowed = ['pending', 'in_progress', 'done'];
  if (!allowed.includes(status)) {
    return res.redirect(`/user/tasks/${taskId}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if user is involved in the task (assigned_to, sorumlu_2, sorumlu_3, konu_sorumlusu)
    const taskCheckResult = await client.query(
      `SELECT id, assigned_to FROM tasks 
       WHERE id = $1 
         AND (assigned_to = $2 
              OR sorumlu_2 = $2 
              OR sorumlu_3 = $2 
              OR konu_sorumlusu::text = $2::text)`,
      [taskId, req.user.id]
    );

    if (taskCheckResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).send('Bu görev için yetkiniz yok.');
    }

    // Update task status (only if user is assigned_to, otherwise just add update record)
    const task = taskCheckResult.rows[0];
    if (task.assigned_to === req.user.id) {
      // Set completed_at when status is 'done', clear it otherwise
      if (status === 'done') {
        // Use manual date if provided, otherwise use current timestamp
        if (completed_at && completed_at.trim()) {
          await client.query(
            'UPDATE tasks SET status = $1, completed_at = $2::timestamp WHERE id = $3',
            [status, completed_at, taskId]
          );
        } else {
          await client.query(
            'UPDATE tasks SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2',
            [status, taskId]
          );
        }
      } else {
        await client.query(
          'UPDATE tasks SET status = $1, completed_at = NULL WHERE id = $2',
          [status, taskId]
        );
      }
    }

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

          // Get task details to notify all involved users
          const taskDetailsResult = await client.query(`
            SELECT assigned_to, sorumlu_2, sorumlu_3, konu_sorumlusu 
            FROM tasks 
            WHERE id = $1
          `, [taskId]);
          
          const taskDetails = taskDetailsResult.rows[0];
          const userIdsToNotify = new Set();
          
          // Add all involved users
          if (taskDetails) {
            if (taskDetails.assigned_to) userIdsToNotify.add(Number(taskDetails.assigned_to));
            if (taskDetails.sorumlu_2) userIdsToNotify.add(Number(taskDetails.sorumlu_2));
            if (taskDetails.sorumlu_3) userIdsToNotify.add(Number(taskDetails.sorumlu_3));
            if (taskDetails.konu_sorumlusu) {
              const konuSorumlusuId = parseInt(taskDetails.konu_sorumlusu);
              if (!isNaN(konuSorumlusuId)) userIdsToNotify.add(konuSorumlusuId);
            }
          }

          // Notify all admins
          const adminsResult = await client.query('SELECT id FROM users WHERE role = $1', ['super_admin']);
          for (const admin of adminsResult.rows) {
            userIdsToNotify.add(admin.id);
          }

          // Notify all involved users (including admins)
          for (const userId of userIdsToNotify) {
            if (userId && userId !== req.user.id) { // Don't notify the updater
              await addNotification(userId, fullMessage, 'task_update', taskId);
            }
          }

    // Insert files if any
    if (files.length) {
      for (const file of files) {
        // Normalize filename encoding for database storage
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        await client.query(
          'INSERT INTO task_files (task_id, uploader_id, filename, original_name, mime_type, uploaded_at, update_id) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)',
          [taskId, req.user.id, file.filename, originalName, file.mimetype, updateId || null]
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

// Translate endpoint for user role
router.post('/translate', async (req, res) => {
  const { text, targetLang } = req.body;
  
  if (!text) {
    return res.json({ success: false, error: 'Text is required' });
  }

  try {
    const translated = await translateText(text, targetLang || 'en');
    res.json({ success: true, translated });
  } catch (err) {
    console.error('Translate error:', err);
    res.json({ success: false, error: 'Translation failed', translated: text });
  }
});

module.exports = router;
