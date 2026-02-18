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
    // Preserve original filename encoding
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, unique + '-' + originalName);
  }
});

const upload = multer({ storage });

// List tasks - creator can only see tasks assigned to them
router.get('/tasks', async (req, res) => {
  const { status, from, to } = req.query;
  const params = [];
  const where = [];
  let paramIndex = 1;

  // Creator can only see tasks assigned to them
  where.push(`(t.assigned_to = $${paramIndex} OR t.sorumlu_2 = $${paramIndex} OR t.sorumlu_3 = $${paramIndex} OR (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = $${paramIndex + 1}))`);
  params.push(req.user.id);
  params.push(req.user.id.toString());
  paramIndex += 2;

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
           u2.username AS sorumlu_2_username,
           u3.username AS sorumlu_3_username,
           ks.username AS konu_sorumlusu_username,
           COALESCE(t.acil, false)::boolean AS acil
    FROM tasks t
    JOIN users c ON t.created_by = c.id
    LEFT JOIN users u ON t.assigned_to = u.id
    LEFT JOIN users u2 ON t.sorumlu_2 = u2.id
    LEFT JOIN users u3 ON t.sorumlu_3 = u3.id
    LEFT JOIN users ks ON (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = ks.id::text)
    ${whereSql}
    ORDER BY t.created_at DESC
  `;

  try {
    const result = await pool.query(sql, params);
    res.render('creator/tasks', {
      pageTitle: req.t('myTasks'),
      tasks: result.rows,
      filters: { status, from, to }
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Task detail - creator can see tasks assigned to them
router.get('/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  const userId = req.user.id;
  try {
    // Creator can only see tasks assigned to them
    const taskResult = await pool.query(
      `SELECT t.*, c.username AS created_username, u.username AS assigned_username,
              u2.username AS sorumlu_2_username, u3.username AS sorumlu_3_username,
              ks.username AS konu_sorumlusu_username
       FROM tasks t
       JOIN users c ON t.created_by = c.id
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users u2 ON t.sorumlu_2 = u2.id
       LEFT JOIN users u3 ON t.sorumlu_3 = u3.id
       LEFT JOIN users ks ON (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = ks.id::text)
       WHERE t.id = $1 
         AND (t.assigned_to = $2 OR t.sorumlu_2 = $2 OR t.sorumlu_3 = $2 
              OR (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = $3))`,
      [taskId, userId, userId.toString()]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).render('errors/404', {
        pageTitle: 'Task Not Found',
        t: req.t,
        lang: req.lang,
        dir: req.dir,
        user: req.user
      });
    }

    const task = taskResult.rows[0];

    // Get task updates
    const updatesResult = await pool.query(
      `SELECT tu.*, u.username
       FROM task_updates tu
       JOIN users u ON tu.user_id = u.id
       WHERE tu.task_id = $1
       ORDER BY tu.created_at DESC`,
      [taskId]
    );

    // Get task files
    const filesResult = await pool.query(
      'SELECT * FROM task_files WHERE task_id = $1 ORDER BY uploaded_at DESC',
      [taskId]
    );

    res.render('creator/task-detail', {
      pageTitle: task.title,
      task: task,
      updates: updatesResult.rows,
      files: filesResult.rows
    });
  } catch (err) {
    console.error('Error fetching task:', err);
    res.sendStatus(500);
  }
});

// Create new task form
router.get('/tasks/new', async (req, res) => {
  try {
    const usersResult = await pool.query('SELECT id, username FROM users ORDER BY username');
    const municipalitiesResult = await pool.query('SELECT id, name FROM municipalities ORDER BY name');
    const regionsResult = await pool.query('SELECT id, name FROM regions ORDER BY name');
    const citiesResult = await pool.query('SELECT id, name FROM cities ORDER BY name');

    res.render('creator/task-form', {
      pageTitle: req.t('createTask'),
      task: null,
      users: usersResult.rows,
      municipalities: municipalitiesResult.rows,
      regions: regionsResult.rows,
      cities: citiesResult.rows
    });
  } catch (err) {
    console.error('Error loading task form:', err);
    res.sendStatus(500);
  }
});

// Create new task
router.post('/tasks', upload.array('attachments', 20), async (req, res) => {
  const {
    title, description, deadline, status, assigned_to,
    tarih, konu_sorumlusu, sorumlu_2, sorumlu_3, bolge, il, belediye, departman, arsiv,
    verilen_is_tarihi, acil
  } = req.body;

  if (!title || !assigned_to) {
    return res.status(400).send('Title and assigned user are required');
  }

  const files = req.files || [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert task with all new fields
    const taskResult = await client.query(
      `INSERT INTO tasks (
        title, description, deadline, status, assigned_to, created_by, created_at,
        tarih, konu_sorumlusu, sorumlu_2, sorumlu_3, bolge, il, belediye, departman, arsiv, verilen_is_tarihi, acil
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [
        title, 
        description, 
        deadline || null, 
        status || 'pending', 
        assigned_to, 
        req.user.id,
        tarih || null,
        konu_sorumlusu || null,
        sorumlu_2 || null,
        sorumlu_3 || null,
        bolge || null,
        il || null,
        belediye || null,
        departman || null,
        arsiv || 'YOK',
        verilen_is_tarihi || null,
        acil === 'true' || acil === true
      ]
    );

    const taskId = taskResult.rows[0].id;

    // Insert files if any
    for (const file of files) {
      // Normalize filename encoding for database storage
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      await client.query(
        'INSERT INTO task_files (task_id, uploader_id, filename, original_name, mime_type, uploaded_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [taskId, req.user.id, file.filename, originalName, file.mimetype]
      );
    }

    // Notification for assigned user
    const actor = req.user && req.user.username ? req.user.username : 'Creator';
    const notificationMessage = `Yeni görev atandı (by ${actor}): ${title}`;
    
    // Notify assigned_to (sorumlu 1)
    if (assigned_to) {
      await addNotification(parseInt(assigned_to), notificationMessage, 'task_assigned', taskId);
    }

    // Notify sorumlu_2
    if (sorumlu_2) {
      await addNotification(parseInt(sorumlu_2), notificationMessage, 'task_assigned', taskId);
    }

    // Notify sorumlu_3
    if (sorumlu_3) {
      await addNotification(parseInt(sorumlu_3), notificationMessage, 'task_assigned', taskId);
    }

    // Notify konu_sorumlusu
    if (konu_sorumlusu) {
      await addNotification(parseInt(konu_sorumlusu), notificationMessage, 'task_assigned', taskId);
    }

    await client.query('COMMIT');
    res.redirect('/creator/tasks');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating task:', err);
    res.sendStatus(500);
  } finally {
    client.release();
  }
});

// Update task (status, note, files) - creator can update tasks assigned to them
router.post('/tasks/:id/update', upload.array('attachments', 20), async (req, res) => {
  const taskId = req.params.id;
  const { status, note, completed_at } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if task exists and is assigned to creator
    const taskCheck = await client.query(
      `SELECT id FROM tasks 
       WHERE id = $1 
         AND (assigned_to = $2 OR sorumlu_2 = $2 OR sorumlu_3 = $2 
              OR (konu_sorumlusu IS NOT NULL AND konu_sorumlusu::text != '' AND konu_sorumlusu::text = $3))`,
      [taskId, req.user.id, req.user.id.toString()]
    );

    if (taskCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).send('You do not have permission to update this task');
    }

    // Update task status and set completed_at when status is 'done'
    if (status) {
      if (status === 'done') {
        if (completed_at && completed_at.trim()) {
          // Use manually provided date
          await client.query(
            'UPDATE tasks SET status = $1, completed_at = $2::timestamp WHERE id = $3',
            [status, completed_at, taskId]
          );
        } else {
          // Auto-set to current timestamp
          await client.query(
            'UPDATE tasks SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2',
            [status, taskId]
          );
        }
      } else {
        // Clear completed_at if status is not 'done'
        await client.query(
          'UPDATE tasks SET status = $1, completed_at = NULL WHERE id = $2',
          [status, taskId]
        );
      }
    }

    // Insert update note
    if (note && note.trim()) {
      const updateResult = await client.query(
        'INSERT INTO task_updates (task_id, user_id, status, note, created_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING id',
        [taskId, req.user.id, status || 'pending', note]
      );
      const updateId = updateResult.rows[0].id;

      // Insert files if any
      const files = req.files || [];
      for (const file of files) {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        await client.query(
          'INSERT INTO task_files (task_id, uploader_id, filename, original_name, mime_type, uploaded_at, update_id) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)',
          [taskId, req.user.id, file.filename, originalName, file.mimetype, updateId]
        );
      }
    }

    await client.query('COMMIT');
    res.redirect(`/creator/tasks/${taskId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating task:', err);
    res.sendStatus(500);
  } finally {
    client.release();
  }
});

module.exports = router;

