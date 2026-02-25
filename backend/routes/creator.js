const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const { getDb } = require('../services/db');
const { addNotification } = require('../services/notifications');
const { streamTaskPdf } = require('../services/pdfHelper');
const { translateText } = require('../services/translate');

const router = express.Router();
const pool = getDb();

const { getUploadsDir } = require('../services/uploadsPath');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getUploadsDir());
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

// Create new task form (must be before /tasks/:id route)
router.get('/tasks/new', async (req, res) => {
  try {
    const usersResult = await pool.query('SELECT id, username FROM users ORDER BY username');
    const municipalitiesResult = await pool.query('SELECT id, name FROM municipalities ORDER BY name');
    const regionsResult = await pool.query('SELECT id, name FROM regions ORDER BY name');
    const citiesResult = await pool.query('SELECT id, name FROM cities ORDER BY name');

    res.render('creator/task-form', {
      pageTitle: req.t('createTask'),
      // task is intentionally omitted so it is undefined in the template (create mode)
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
        user: req.user,
        dashboardUrl: '/creator/tasks'
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

// Task edit form - creator can edit tasks assigned to them
router.get('/tasks/:id/edit', async (req, res) => {
  const taskId = req.params.id;
  const userId = req.user.id;
  
  try {
    // Creator can only edit tasks assigned to them
    const taskResult = await pool.query(
      `SELECT t.*
       FROM tasks t
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
        user: req.user,
        dashboardUrl: '/creator/tasks'
      });
    }

    const task = taskResult.rows[0];
    
    // Get task updates (aşamalar)
    const updatesResult = await pool.query(
      `SELECT tu.*, u.username
       FROM task_updates tu
       JOIN users u ON tu.user_id = u.id
       WHERE tu.task_id = $1
       ORDER BY tu.created_at DESC`,
      [taskId]
    );

    const usersResult = await pool.query('SELECT id, username FROM users ORDER BY username');
    const municipalitiesResult = await pool.query('SELECT id, name FROM municipalities ORDER BY name');
    const regionsResult = await pool.query('SELECT id, name FROM regions ORDER BY name');
    const citiesResult = await pool.query('SELECT id, name FROM cities ORDER BY name');

    res.render('creator/task-form', {
      pageTitle: req.t('editTask'),
      task: task,
      updates: updatesResult.rows,
      users: usersResult.rows,
      municipalities: municipalitiesResult.rows,
      regions: regionsResult.rows,
      cities: citiesResult.rows
    });
  } catch (err) {
    console.error('Error loading task edit form:', err);
    res.sendStatus(500);
  }
});

// Task detail PDF - creator can only see tasks assigned/involved
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
         AND (t.assigned_to = $2 OR t.sorumlu_2 = $2 OR t.sorumlu_3 = $2 
              OR (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = $3))`,
      [taskId, userId, userId.toString()]
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
    console.error('Error generating creator task PDF:', err);
    res.sendStatus(500);
  }
});

// Create new task
router.post('/tasks', upload.array('attachments', 20), async (req, res) => {
  const {
    title, description, deadline, status, assigned_to,
    tarih, konu_sorumlusu, sorumlu_2, sorumlu_3, bolge, il, belediye, departman, arsiv,
    verilen_is_tarihi, acil, task_subject
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
        tarih, konu_sorumlusu, sorumlu_2, sorumlu_3, bolge, il, belediye, departman, arsiv, verilen_is_tarihi, acil, task_subject
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
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
        acil === 'true' || acil === true,
        task_subject || null
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
    console.error('Request body:', req.body);
    res.status(500).send(`Error creating task: ${err.message}`);
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

// Reports page with filters (for admin role)
// This route handles /creator/reports
router.get('/reports', async (req, res) => {
  const {
    userId,
    status,
    from,
    to,
    city,
    municipality,
    region,
    from_verilen,
    to_verilen,
    from_completed,
    to_completed,
    departman,
    arsiv,
    filterTypes: filterTypesRaw,
    filterType
  } = req.query;

  let filterTypes = [];
  if (typeof filterTypesRaw === 'string' && filterTypesRaw.trim()) {
    filterTypes = filterTypesRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  } else if (typeof filterType === 'string' && filterType.trim()) {
    filterTypes = [filterType.trim()];
  }

  if (filterTypes.length === 0) {
    if (userId) filterTypes.push('user');
    if (status) filterTypes.push('status');
    if (city) filterTypes.push('city');
    if (municipality) filterTypes.push('municipality');
    if (region) filterTypes.push('region');
    if (from || to) filterTypes.push('date');
    if (from_verilen || to_verilen) filterTypes.push('given_date');
    if (from_completed || to_completed) filterTypes.push('completed_date');
    if (departman) filterTypes.push('department');
    if (arsiv) filterTypes.push('archive');
  }

  const params = [];
  const where = [];
  let paramIndex = 1;

  // Admin role can only see their own tasks (assigned_to, sorumlu_2, sorumlu_3, konu_sorumlusu)
  // Ignore userId filter for admin role - they can only see their own tasks
  where.push(`(
    t.assigned_to = $${paramIndex} 
    OR t.sorumlu_2 = $${paramIndex} 
    OR t.sorumlu_3 = $${paramIndex} 
    OR (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = $${paramIndex + 1}::text)
  )`);
  params.push(req.user.id);
  params.push(req.user.id.toString());
  paramIndex += 2;
  if (status) {
    where.push(`t.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }
  if (city) {
    where.push(`t.il = $${paramIndex}`);
    params.push(city);
    paramIndex++;
  }
  if (municipality) {
    where.push(`t.belediye = $${paramIndex}`);
    params.push(municipality);
    paramIndex++;
  }
  if (region) {
    where.push(`t.bolge = $${paramIndex}`);
    params.push(region);
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
  if (from_verilen) {
    where.push(`DATE(t.verilen_is_tarihi) >= DATE($${paramIndex})`);
    params.push(from_verilen);
    paramIndex++;
  }
  if (to_verilen) {
    where.push(`DATE(t.verilen_is_tarihi) <= DATE($${paramIndex})`);
    params.push(to_verilen);
    paramIndex++;
  }
  if (from_completed) {
    where.push(`DATE(t.completed_at) >= DATE($${paramIndex})`);
    params.push(from_completed);
    paramIndex++;
  }
  if (to_completed) {
    where.push(`DATE(t.completed_at) <= DATE($${paramIndex})`);
    params.push(to_completed);
    paramIndex++;
  }
  if (departman) {
    where.push(`t.departman = $${paramIndex}`);
    params.push(departman);
    paramIndex++;
  }
  if (arsiv && arsiv !== 'undefined' && arsiv !== 'null') {
    where.push(`t.arsiv = $${paramIndex}`);
    params.push(arsiv);
    paramIndex++;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    SELECT t.*, 
           u.username AS assigned_username, 
           c.username AS created_username,
           u2.username AS sorumlu_2_username,
           u3.username AS sorumlu_3_username,
           ks.username AS konu_sorumlusu_username,
           COALESCE(t.acil, false)::boolean AS acil
    FROM tasks t
    JOIN users u ON t.assigned_to = u.id
    JOIN users c ON t.created_by = c.id
    LEFT JOIN users u2 ON t.sorumlu_2 = u2.id
    LEFT JOIN users u3 ON t.sorumlu_3 = u3.id
    LEFT JOIN users ks ON (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = ks.id::text)
    ${whereSql}
    ORDER BY t.created_at DESC
  `;

  try {
    const usersResult = await pool.query('SELECT id, username FROM users ORDER BY username');
    const citiesResult = await pool.query('SELECT id, name FROM cities ORDER BY name');
    const municipalitiesResult = await pool.query('SELECT id, name FROM municipalities ORDER BY name');
    const regionsResult = await pool.query('SELECT id, name FROM regions ORDER BY name');
    const tasksResult = await pool.query(sql, params);
    
    res.render('creator/reports', {
      pageTitle: req.t('reports'),
      tasks: tasksResult.rows,
      users: usersResult.rows,
      cities: citiesResult.rows,
      municipalities: municipalitiesResult.rows,
      regions: regionsResult.rows,
      filters: { userId, status, from, to, city, municipality, region, from_verilen, to_verilen, from_completed, to_completed, departman, arsiv, filterTypes }
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Export tasks to Excel (for admin role)
// Handle both /creator/reports/export and /admin/reports/export for admin role
router.get('/admin/reports/export', async (req, res) => {
  // Redirect to /creator/reports/export to maintain consistency
  const queryString = Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query).toString() : '';
  return res.redirect(`/creator/reports/export${queryString}`);
});

router.get('/reports/export', async (req, res) => {
  const { userId, status, from, to, city, municipality, region, from_verilen, to_verilen, from_completed, to_completed, departman, arsiv } = req.query;

  const params = [];
  const where = [];
  let paramIndex = 1;

  // Admin role can only see their own tasks (assigned_to, sorumlu_2, sorumlu_3, konu_sorumlusu)
  // Ignore userId filter for admin role - they can only see their own tasks
  where.push(`(
    t.assigned_to = $${paramIndex} 
    OR t.sorumlu_2 = $${paramIndex} 
    OR t.sorumlu_3 = $${paramIndex} 
    OR (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = $${paramIndex + 1}::text)
  )`);
  params.push(req.user.id);
  params.push(req.user.id.toString());
  paramIndex += 2;
  if (status && status !== 'undefined' && status !== 'null') {
    where.push(`t.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }
  if (city && city !== 'undefined' && city !== 'null') {
    where.push(`t.il = $${paramIndex}`);
    params.push(city);
    paramIndex++;
  }
  if (municipality && municipality !== 'undefined' && municipality !== 'null') {
    where.push(`t.belediye = $${paramIndex}`);
    params.push(municipality);
    paramIndex++;
  }
  if (region && region !== 'undefined' && region !== 'null') {
    where.push(`t.bolge = $${paramIndex}`);
    params.push(region);
    paramIndex++;
  }
  if (from && from !== 'undefined' && from !== 'null') {
    where.push(`DATE(t.deadline) >= DATE($${paramIndex})`);
    params.push(from);
    paramIndex++;
  }
  if (to && to !== 'undefined' && to !== 'null') {
    where.push(`DATE(t.deadline) <= DATE($${paramIndex})`);
    params.push(to);
    paramIndex++;
  }
  if (from_verilen && from_verilen !== 'undefined' && from_verilen !== 'null') {
    where.push(`DATE(t.verilen_is_tarihi) >= DATE($${paramIndex})`);
    params.push(from_verilen);
    paramIndex++;
  }
  if (to_verilen && to_verilen !== 'undefined' && to_verilen !== 'null') {
    where.push(`DATE(t.verilen_is_tarihi) <= DATE($${paramIndex})`);
    params.push(to_verilen);
    paramIndex++;
  }
  if (from_completed && from_completed !== 'undefined' && from_completed !== 'null') {
    where.push(`DATE(t.completed_at) >= DATE($${paramIndex})`);
    params.push(from_completed);
    paramIndex++;
  }
  if (to_completed && to_completed !== 'undefined' && to_completed !== 'null') {
    where.push(`DATE(t.completed_at) <= DATE($${paramIndex})`);
    params.push(to_completed);
    paramIndex++;
  }
  if (departman && departman !== 'undefined' && departman !== 'null') {
    where.push(`t.departman = $${paramIndex}`);
    params.push(departman);
    paramIndex++;
  }
  if (arsiv && arsiv !== 'undefined' && arsiv !== 'null') {
    where.push(`t.arsiv = $${paramIndex}`);
    params.push(arsiv);
    paramIndex++;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    SELECT t.*, 
           u.username AS assigned_username,
           u2.username AS sorumlu_2_username,
           u3.username AS sorumlu_3_username,
           ks.username AS konu_sorumlusu_username,
           c.username AS created_username,
           COALESCE(t.acil, false)::boolean AS acil
    FROM tasks t
    JOIN users u ON t.assigned_to = u.id
    LEFT JOIN users u2 ON t.sorumlu_2::text = u2.id::text
    LEFT JOIN users u3 ON t.sorumlu_3::text = u3.id::text
    LEFT JOIN users ks ON (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = ks.id::text)
    JOIN users c ON t.created_by = c.id
    ${whereSql}
    ORDER BY t.created_at DESC
  `;

  try {
    const tasksResult = await pool.query(sql, params);
    const tasks = tasksResult.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Görevler');

    worksheet.columns = [
      { header: 'TARİH', key: 'tarih', width: 12 },
      { header: 'KONU SORUMLUSU', key: 'konu_sorumlusu', width: 15 },
      { header: 'SORUMLU 1', key: 'sorumlu_1', width: 15 },
      { header: 'SORUMLU 2', key: 'sorumlu_2', width: 15 },
      { header: 'SORUMLU 3', key: 'sorumlu_3', width: 15 },
      { header: 'BÖLGE', key: 'bolge', width: 15 },
      { header: 'İL', key: 'il', width: 15 },
      { header: 'BELEDİYE', key: 'belediye', width: 15 },
      { header: 'DEPARTMAN', key: 'departman', width: 15 },
      { header: 'KONU', key: 'konu', width: 20 },
      { header: 'İŞ KONUSU', key: 'is_konusu', width: 30 },
      { header: 'VERİLEN İŞ TARİHİ', key: 'verilen_is_tarihi', width: 18 },
      { header: 'TAHMİNİ İŞ BİTİŞ TARİHİ', key: 'tahmini_is_bitis_tarihi', width: 22 },
      { header: 'ARŞİV', key: 'arsiv', width: 10 },
      { header: 'DURUM', key: 'durum', width: 15 }
    ];

    worksheet.getRow(1).font = { bold: true, size: 11 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFC000' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    tasks.forEach(task => {
      const row = worksheet.addRow({
        tarih: task.tarih ? (typeof task.tarih === 'string' ? task.tarih.slice(0,10) : new Date(task.tarih).toISOString().slice(0,10)) : '',
        konu_sorumlusu: task.konu_sorumlusu_username || '',
        sorumlu_1: task.assigned_username || '',
        sorumlu_2: task.sorumlu_2_username || '',
        sorumlu_3: task.sorumlu_3_username || '',
        bolge: task.bolge || '',
        il: task.il || '',
        belediye: task.belediye || '',
        departman: task.departman || '',
        konu: task.title || '',
        is_konusu: task.task_subject || '',
        verilen_is_tarihi: task.verilen_is_tarihi ? (typeof task.verilen_is_tarihi === 'string' ? task.verilen_is_tarihi.slice(0,10) : new Date(task.verilen_is_tarihi).toISOString().slice(0,10)) : '',
        tahmini_is_bitis_tarihi: task.deadline ? (typeof task.deadline === 'string' ? task.deadline.slice(0,10) : new Date(task.deadline).toISOString().slice(0,10)) : '',
        arsiv: task.arsiv || 'YOK',
        durum: task.status === 'done' ? 'BİTTİ' : task.status === 'in_progress' ? 'DEVAM EDİYOR' : task.status === 'onemli' ? 'ÖNEMLİ' : 'BEKLEMEDE'
      });

      const departmanCell = row.getCell('departman');
      if (task.departman === 'SAHA') {
        departmanCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF92D050' }
        };
      } else if (task.departman === 'BELEDİYE') {
        departmanCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' }
        };
      } else if (task.departman === 'HUKUK') {
        departmanCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC000' }
        };
      }

      const durumCell = row.getCell('durum');
      if (task.status === 'done') {
        durumCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF92D050' }
        };
      } else if (task.status === 'in_progress') {
        durumCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEB9C' }
        };
      } else if (task.status === 'onemli') {
        durumCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFF0000' }
        };
        durumCell.font = { color: { argb: 'FFFFFFFF' } };
      }
    });

    const datePart = new Date().toISOString().slice(0, 10);
    const nameParts = ['gorevler'];
    if (userId && userId !== 'undefined' && userId !== 'null') {
      nameParts.push(`kullanici_${userId}`);
    }
    if (status && status !== 'undefined' && status !== 'null') {
      nameParts.push(`durum_${status}`);
    }
    if (city && city !== 'undefined' && city !== 'null') {
      nameParts.push(`il_${city}`);
    }
    if (municipality && municipality !== 'undefined' && municipality !== 'null') {
      nameParts.push(`belediye_${municipality}`);
    }
    if (region && region !== 'undefined' && region !== 'null') {
      nameParts.push(`bolge_${region}`);
    }
    if (departman && departman !== 'undefined' && departman !== 'null') {
      nameParts.push(`departman_${departman}`);
    }
    nameParts.push(datePart);
    const safeFileName = nameParts.join('_').replace(/[^a-zA-Z0-9_]/g, '_');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${safeFileName}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    res.sendStatus(500);
  }
});

// Translate endpoint for admin role
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

// Quick add municipality (for admin role)
router.post('/municipalities/quick-add', async (req, res) => {
  const { name } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Belediye adı gereklidir' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO municipalities (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name',
      [name.trim()]
    );

    if (result.rows.length === 0) {
      // Municipality already exists
      const existingResult = await pool.query('SELECT id, name FROM municipalities WHERE name = $1', [name.trim()]);
      if (existingResult.rows.length > 0) {
        return res.json({ success: true, name: existingResult.rows[0].name });
      }
      return res.status(400).json({ success: false, error: 'Belediye eklenemedi' });
    }

    res.json({ success: true, name: result.rows[0].name });
  } catch (err) {
    console.error('Error adding municipality:', err);
    res.status(500).json({ success: false, error: 'Belediye eklenirken hata oluştu' });
  }
});

// Quick add region (for admin role)
router.post('/regions/quick-add', async (req, res) => {
  const { name } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Bölge adı gereklidir' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO regions (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name',
      [name.trim()]
    );

    if (result.rows.length === 0) {
      // Region already exists
      const existingResult = await pool.query('SELECT id, name FROM regions WHERE name = $1', [name.trim()]);
      if (existingResult.rows.length > 0) {
        return res.json({ success: true, name: existingResult.rows[0].name });
      }
      return res.status(400).json({ success: false, error: 'Bölge eklenemedi' });
    }

    res.json({ success: true, name: result.rows[0].name });
  } catch (err) {
    console.error('Error adding region:', err);
    res.status(500).json({ success: false, error: 'Bölge eklenirken hata oluştu' });
  }
});

// Quick add city (for admin role)
router.post('/cities/quick-add', async (req, res) => {
  const { name } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'İl adı gereklidir' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO cities (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name',
      [name.trim()]
    );

    if (result.rows.length === 0) {
      // City already exists
      const existingResult = await pool.query('SELECT id, name FROM cities WHERE name = $1', [name.trim()]);
      if (existingResult.rows.length > 0) {
        return res.json({ success: true, name: existingResult.rows[0].name });
      }
      return res.status(400).json({ success: false, error: 'İl eklenemedi' });
    }

    res.json({ success: true, name: result.rows[0].name });
  } catch (err) {
    console.error('Error adding city:', err);
    res.status(500).json({ success: false, error: 'İl eklenirken hata oluştu' });
  }
});

// Quick add user (for admin role)
router.post('/users/quick-add', async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !password || !role) {
    return res.json({ success: false, error: 'Username, password and role are required' });
  }
  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username',
      [username, email || null, passwordHash, role]
    );
    res.json({ success: true, userId: result.rows[0].id, username: result.rows[0].username });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.message || 'Error adding user' });
  }
});

module.exports = router;

