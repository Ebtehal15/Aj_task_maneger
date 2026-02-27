const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const { getDb } = require('../services/db');
const { addNotification } = require('../services/notifications');
const { sendTaskAssignedEmail } = require('../services/email');
const { translateText } = require('../services/translate');

const router = express.Router();
const pool = getDb();

const { getUploadsDir, getAvatarsDir, resolveUploadPath } = require('../services/uploadsPath');

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

// Avatar upload için ayrı storage
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getAvatarsDir());
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
      'image/png',
      // Bazı tarayıcılar (veya istemciler) dosya tipini tanıyamayınca
      // `application/octet-stream` gönderebiliyor. Uzantı doğruysa bunu da kabul edelim.
      'application/octet-stream'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

const { streamTaskPdf } = require('../services/pdfHelper');

// Admin dashboard - with optional filters from query params
router.get('/dashboard', async (req, res) => {
  console.log(`📊 Admin dashboard accessed - user: ${req.user ? req.user.username : 'null'}, sessionId: ${req.sessionID}`);
  
  const { status, urgent } = req.query;
  const where = [];
  const params = [];
  let paramIndex = 1;

  if (status) {
    where.push(`t.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (urgent === 'true') {
    where.push(`COALESCE(t.acil, false)::boolean = true`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

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
    // Get all tasks for statistics (unfiltered)
    const allTasksResult = await pool.query(`
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
      ORDER BY t.created_at DESC
    `);
    const allTasks = allTasksResult.rows;
    
    // Get filtered tasks for display
    const tasksResult = await pool.query(sql, params);
    const tasks = tasksResult.rows;
    
    // Calculate statistics from all tasks (not filtered)
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'done').length;
    const pendingTasks = allTasks.filter(t => t.status === 'pending').length;
    const inProgressTasks = allTasks.filter(t => t.status === 'in_progress').length;
    // PostgreSQL boolean values can be true, 't', 'true', or 1
    const urgentTasks = allTasks.filter(t => {
      const acil = t.acil;
      return acil === true || acil === 'true' || acil === 't' || acil === 1 || acil === '1';
    }).length;
    
    // Find most assigned user - count tasks where user is involved in any role
    // (assigned_to, sorumlu_2, sorumlu_3, or konu_sorumlusu)
    const userTaskCounts = {};
    allTasks.forEach(task => {
      // Collect all usernames involved in this task (unique set)
      const involvedUsers = new Set();
      
      if (task.assigned_username) involvedUsers.add(task.assigned_username);
      if (task.sorumlu_2_username) involvedUsers.add(task.sorumlu_2_username);
      if (task.sorumlu_3_username) involvedUsers.add(task.sorumlu_3_username);
      if (task.konu_sorumlusu_username) involvedUsers.add(task.konu_sorumlusu_username);
      
      // Count this task for each involved user
      involvedUsers.forEach(username => {
        userTaskCounts[username] = (userTaskCounts[username] || 0) + 1;
      });
    });
    
    const mostAssignedUser = Object.keys(userTaskCounts).length > 0
      ? Object.entries(userTaskCounts).sort((a, b) => b[1] - a[1])[0]
      : null;
    
    const stats = {
      totalTasks,
      completedTasks,
      pendingTasks,
      inProgressTasks,
      urgentTasks,
      mostAssignedUser: mostAssignedUser ? {
        username: mostAssignedUser[0],
        taskCount: mostAssignedUser[1]
      } : null
    };
    
    res.render('admin/dashboard', {
      pageTitle: req.t('adminDashboard'),
      tasks: tasks,
      users: [],
      filters: { status, urgent },
      totalTasks: totalTasks,
      stats: stats
    });
  } catch (err) {
    console.error('❌ Dashboard error:', err);
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint
    });
    console.error('Error stack:', err.stack);
    // Render error page instead of just sending status
    res.status(500).send(`
      <h1>Internal Server Error</h1>
      <p>Error: ${err.message}</p>
      <p><a href="/admin/dashboard">Try again</a></p>
    `);
  }
});

// Tasks page - shows all tasks (similar to dashboard but dedicated page)
// Admin's My Tasks page - tasks where admin is involved
router.get('/my-tasks', async (req, res) => {
  const adminId = req.user.id;
  
  try {
    // Get tasks where admin is assigned_to, sorumlu_2, sorumlu_3, or konu_sorumlusu
    const tasksResult = await pool.query(`
      SELECT DISTINCT t.*, 
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
      WHERE t.assigned_to = $1 
         OR t.sorumlu_2 = $1 
         OR t.sorumlu_3 = $1 
         OR t.konu_sorumlusu::text = $1::text
      ORDER BY t.created_at DESC
    `, [adminId]);
    
    const tasks = tasksResult.rows;
    
    res.render('admin/my-tasks', {
      pageTitle: 'My Tasks',
      tasks,
      currentUser: req.user
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

router.get('/tasks', async (req, res) => {
  console.log(`📋 Admin tasks page accessed - user: ${req.user ? req.user.username : 'null'}, sessionId: ${req.sessionID}`);

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
    ORDER BY t.created_at DESC
  `;

  try {
    const tasksResult = await pool.query(sql);
    
    res.render('admin/tasks', {
      pageTitle: req.t('tasks'),
      tasks: tasksResult.rows
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Reports page with filters
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
    // Backward-compat: older UI used a single filterType
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

  // If filterTypes not provided but filters exist (e.g. shared link), infer so UI shows the relevant inputs.
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

  if (userId) {
    // Kullanıcı assigned_to, sorumlu_2, sorumlu_3 veya konu_sorumlusu alanlarında yer alıyorsa göster
    where.push(`(
      t.assigned_to = $${paramIndex} 
      OR t.sorumlu_2 = $${paramIndex} 
      OR t.sorumlu_3 = $${paramIndex} 
      OR (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = $${paramIndex}::text)
    )`);
    params.push(userId);
    paramIndex++;
  }
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
    
    res.render('admin/reports', {
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

// Upload temporary Excel file for sharing
router.post('/reports/upload-temp', async (req, res) => {
  try {
    const { fileData, fileName } = req.body;
    
    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'Missing file data or filename' });
    }
    
    // Base64'ten buffer'a çevir
    const buffer = Buffer.from(fileData, 'base64');
    
    // Geçici dosya adı oluştur
    const tempFileName = 'temp_' + Date.now() + '_' + Math.round(Math.random() * 1e9) + '_' + fileName;
    const tempFilePath = path.join(uploadDir, tempFileName);
    
    // Dosyayı kaydet
    fs.writeFileSync(tempFilePath, buffer);
    
    // 1 saat sonra silmek için zamanlayıcı
    setTimeout(() => {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }, 60 * 60 * 1000); // 1 saat
    
    // Dosya linkini döndür
    const fileUrl = `/uploads/${tempFileName}`;
    res.json({ url: fileUrl, fileName: fileName });
  } catch (error) {
    console.error('Temp upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Export tasks to Excel
router.get('/reports/export', async (req, res) => {
  const { userId, status, from, to, city, municipality, region, from_verilen, to_verilen, from_completed, to_completed, departman, arsiv } = req.query;

  const params = [];
  const where = [];
  let paramIndex = 1;

  // Only add filters if they are valid (not undefined, null, or empty string)
  if (userId && userId !== 'undefined' && userId !== 'null') {
    where.push(`t.assigned_to = $${paramIndex}`);
    params.push(parseInt(userId));
    paramIndex++;
  }
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

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Görevler');

    // Define columns
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

    // Style header row
    worksheet.getRow(1).font = { bold: true, size: 11 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFC000' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Add data rows
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

      // Color code departman column
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

      // Color code durum column
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

    // Build dynamic file name based on active filters so each filter result has its own Excel file
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
    if ((from && from !== 'undefined' && from !== 'null') || (to && to !== 'undefined' && to !== 'null')) {
      const fromPart = from && from !== 'undefined' && from !== 'null' ? from : 'any';
      const toPart = to && to !== 'undefined' && to !== 'null' ? to : 'any';
      nameParts.push(`tarih_${fromPart}_${toPart}`);
    }
    if ((from_verilen && from_verilen !== 'undefined' && from_verilen !== 'null') || (to_verilen && to_verilen !== 'undefined' && to_verilen !== 'null')) {
      const fromPart = from_verilen && from_verilen !== 'undefined' && from_verilen !== 'null' ? from_verilen : 'any';
      const toPart = to_verilen && to_verilen !== 'undefined' && to_verilen !== 'null' ? to_verilen : 'any';
      nameParts.push(`verilen_${fromPart}_${toPart}`);
    }
    if ((from_completed && from_completed !== 'undefined' && from_completed !== 'null') || (to_completed && to_completed !== 'undefined' && to_completed !== 'null')) {
      const fromPart = from_completed && from_completed !== 'undefined' && from_completed !== 'null' ? from_completed : 'any';
      const toPart = to_completed && to_completed !== 'undefined' && to_completed !== 'null' ? to_completed : 'any';
      nameParts.push(`bitis_${fromPart}_${toPart}`);
    }
    if (departman && departman !== 'undefined' && departman !== 'null') {
      nameParts.push(`departman_${departman}`);
    }
    nameParts.push(datePart);

    // Basit slug - boşlukları ve özel karakterleri alt çizgiyle değiştir
    const rawFileName = nameParts.join('_');
    const safeFileName = rawFileName.replace(/[^\w\-]+/g, '_');

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${safeFileName}.xlsx`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).send('Excel export failed: ' + err.message);
  }
});

// New staff form + list
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, role, avatar FROM users ORDER BY role DESC, username');
    res.render('admin/users', {
      pageTitle: 'Users',
      users: result.rows,
      error: null,
      currentUser: req.user
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Quick add user (AJAX endpoint)
// Quick add municipality
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

// Quick add region
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

// Quick add city
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
        const oldAvatarPath = resolveUploadPath(oldUser.rows[0].avatar);
        if (oldAvatarPath && fs.existsSync(oldAvatarPath)) {
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

// Delete user
router.post('/users/:id/delete', async (req, res) => {
  const userId = req.params.id;
  
  // Prevent deleting yourself
  if (req.user.id == userId) {
    return res.json({ success: false, error: 'You cannot delete your own account' });
  }
  
  try {
    // Check if user has assigned tasks
    const tasksResult = await pool.query('SELECT COUNT(*) as count FROM tasks WHERE assigned_to = $1', [userId]);
    if (tasksResult.rows[0].count > 0) {
      return res.json({ success: false, error: 'Cannot delete user with assigned tasks' });
    }
    
    // Delete user's avatar if exists
    const userResult = await pool.query('SELECT avatar FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length > 0 && userResult.rows[0].avatar) {
      const avatarPath = resolveUploadPath(userResult.rows[0].avatar);
      if (avatarPath && fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }
    
    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.message || 'Error deleting user' });
  }
});

// Create task form
router.get('/tasks/new', async (req, res) => {
  try {
    // Get all users (both admin and user roles) for task assignment
    const usersResult = await pool.query('SELECT id, username FROM users ORDER BY username');
    // Get all municipalities
    const municipalitiesResult = await pool.query('SELECT id, name FROM municipalities ORDER BY name');
    // Get all regions
    const regionsResult = await pool.query('SELECT id, name FROM regions ORDER BY name');
    // Get all cities
    const citiesResult = await pool.query('SELECT id, name FROM cities ORDER BY name');
    
    res.render('admin/task-form', {
      pageTitle: 'Create Task',
      users: usersResult.rows,
      municipalities: municipalitiesResult.rows,
      regions: regionsResult.rows,
      cities: citiesResult.rows
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Old create task form route (keeping for backward compatibility)
router.get('/tasks/new-old', async (req, res) => {
  try {
    // Get all users (both admin and user roles) for task assignment
    const result = await pool.query('SELECT id, username FROM users ORDER BY username');
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
router.post('/tasks', upload.array('attachments', 20), async (req, res) => {
  const { 
    title, 
    description, 
    deadline, 
    assigned_to,
    tarih,
    konu_sorumlusu,
    sorumlu_2,
    sorumlu_3,
    bolge,
    il,
    belediye,
    departman,
    arsiv,
    verilen_is_tarihi,
    acil,
    status,
    task_subject
  } = req.body;
      const files = req.files || [];

  // Validation
  if (!title || !title.trim()) {
    return res.status(400).send('Title is required');
  }
  if (!assigned_to) {
    return res.status(400).send('Assigned user is required');
  }

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

      // Notification + email for all responsible users (deduplicated)
      const actor = req.user && req.user.username ? req.user.username : 'Admin';
      const notificationMessage = `Yeni görev atandı (by ${actor}): ${title}`;

      const userIdsToNotify = new Set();

      if (assigned_to) userIdsToNotify.add(Number(assigned_to));
      if (sorumlu_2 && sorumlu_2 !== '') userIdsToNotify.add(Number(sorumlu_2));
      if (sorumlu_3 && sorumlu_3 !== '') userIdsToNotify.add(Number(sorumlu_3));
      if (konu_sorumlusu && konu_sorumlusu !== '') {
        const konuSorumlusuId = parseInt(konu_sorumlusu);
        if (!isNaN(konuSorumlusuId)) {
          userIdsToNotify.add(konuSorumlusuId);
        }
      }

      for (const userId of userIdsToNotify) {
        if (!userId) continue;

        await addNotification(
          userId,
          notificationMessage,
          'task_assigned',
          taskId
        );

        // Try to send email if user has email address
        const emailResult = await client.query('SELECT email FROM users WHERE id = $1', [userId]);
        if (emailResult.rows.length > 0 && emailResult.rows[0].email) {
          sendTaskAssignedEmail(emailResult.rows[0].email, title, deadline || null, taskId);
        }
      }

    await client.query('COMMIT');
      res.redirect('/admin/dashboard');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating task:', err);
    console.error('Request body:', req.body);
    res.status(500).send(`Error creating task: ${err.message}`);
  } finally {
    client.release();
  }
});

// Task detail
router.get('/tasks/:id', async (req, res) => {
  const taskId = req.params.id;

  try {
    const taskResult = await pool.query(
    `SELECT t.*, 
            u.username AS assigned_username, 
            c.username AS created_username,
            ks.username AS konu_sorumlusu_username
     FROM tasks t
     JOIN users u ON t.assigned_to = u.id
     JOIN users c ON t.created_by = c.id
     LEFT JOIN users ks ON (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = ks.id::text)
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

// Delete a single attached file from a task
router.post('/tasks/:taskId/files/:fileId/delete', async (req, res) => {
  const { taskId, fileId } = req.params;

  try {
    // Find file and ensure it belongs to this task
    const fileResult = await pool.query(
      'SELECT filename FROM task_files WHERE id = $1 AND task_id = $2',
      [fileId, taskId]
    );

    if (fileResult.rows.length === 0) {
      return res.redirect(`/admin/tasks/${taskId}`);
    }

    const filename = fileResult.rows[0].filename;

    // Delete DB record
    await pool.query('DELETE FROM task_files WHERE id = $1', [fileId]);

    // Try to delete the physical file (ignore errors)
    try {
      const filePath = path.join(getUploadsDir(), filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error('Error deleting file from disk:', e);
    }

    res.redirect(`/admin/tasks/${taskId}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/admin/tasks/${taskId}`);
  }
});

// Task detail PDF (for sharing/printing)
router.get('/tasks/:id/pdf', async (req, res) => {
  const taskId = req.params.id;

  try {
    const taskResult = await pool.query(
      `SELECT t.*,
              u.username  AS assigned_username,
              u2.username AS sorumlu_2_username,
              u3.username AS sorumlu_3_username,
              c.username  AS created_username,
              ks.username AS konu_sorumlusu_username
       FROM tasks t
       JOIN users u  ON t.assigned_to = u.id
       JOIN users c  ON t.created_by = c.id
       LEFT JOIN users u2 ON t.sorumlu_2 = u2.id
       LEFT JOIN users u3 ON t.sorumlu_3 = u3.id
       LEFT JOIN users ks ON (t.konu_sorumlusu IS NOT NULL AND t.konu_sorumlusu::text != '' AND t.konu_sorumlusu::text = ks.id::text)
       WHERE t.id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
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
    console.error('Error generating admin task PDF:', err);
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

    // Get all users (both admin and user roles) for task assignment
    const usersResult = await pool.query('SELECT id, username FROM users ORDER BY username');
    // Get all municipalities
    const municipalitiesResult = await pool.query('SELECT id, name FROM municipalities ORDER BY name');
    // Get all regions
    const regionsResult = await pool.query('SELECT id, name FROM regions ORDER BY name');
    // Get all cities
    const citiesResult = await pool.query('SELECT id, name FROM cities ORDER BY name');
    
        res.render('admin/task-form', {
          pageTitle: 'Edit Task',
      users: usersResult.rows,
      municipalities: municipalitiesResult.rows,
      regions: regionsResult.rows,
      cities: citiesResult.rows,
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
  const { 
    title, 
    description, 
    deadline, 
    assigned_to,
    tarih,
    konu_sorumlusu,
    sorumlu_2,
    sorumlu_3,
    bolge,
    il,
    belediye,
    departman,
    arsiv,
    verilen_is_tarihi,
    acil,
    status,
    task_subject
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get old task data to compare
    const oldTaskResult = await client.query('SELECT assigned_to, sorumlu_2, sorumlu_3, konu_sorumlusu, title, description, deadline, tarih, bolge, il, belediye, departman, arsiv, verilen_is_tarihi, acil, status, task_subject FROM tasks WHERE id = $1', [taskId]);
    const oldTask = oldTaskResult.rows[0];

    const finalStatus = status || 'pending';
    // Set completed_at when status is 'done', clear it otherwise
    const completedAtParam = finalStatus === 'done' ? 'CURRENT_TIMESTAMP' : null;
    
    // Fall back to existing values if some fields are missing from the form
    const updatedTitle = title && title.trim() ? title : (oldTask ? oldTask.title : null);
    const updatedDescription = typeof description !== 'undefined' ? description : (oldTask ? oldTask.description : null);
    const updatedDeadline = typeof deadline !== 'undefined' && deadline !== '' ? deadline : (oldTask ? oldTask.deadline : null);
    const updatedTarih = typeof tarih !== 'undefined' && tarih !== '' ? tarih : (oldTask ? oldTask.tarih : null);
    const updatedBolge = typeof bolge !== 'undefined' ? bolge : (oldTask ? oldTask.bolge : null);
    const updatedIl = typeof il !== 'undefined' ? il : (oldTask ? oldTask.il : null);
    const updatedBelediye = typeof belediye !== 'undefined' ? belediye : (oldTask ? oldTask.belediye : null);
    const updatedDepartman = typeof departman !== 'undefined' ? departman : (oldTask ? oldTask.departman : null);
    const updatedArsiv = typeof arsiv !== 'undefined' ? arsiv : (oldTask ? oldTask.arsiv : 'YOK');
    const updatedVerilenIsTarihi = typeof verilen_is_tarihi !== 'undefined' && verilen_is_tarihi !== '' ? verilen_is_tarihi : (oldTask ? oldTask.verilen_is_tarihi : null);
    const updatedAcil = typeof acil !== 'undefined' ? (acil === 'true' || acil === true) : (oldTask ? oldTask.acil : false);
    const updatedTaskSubject = typeof task_subject !== 'undefined' ? task_subject : (oldTask ? oldTask.task_subject : null);
    // assigned_to boş veya undefined gelirse eski değere geri dön
    const updatedAssignedTo = assigned_to && String(assigned_to).trim() !== '' ? assigned_to : (oldTask ? oldTask.assigned_to : null);

    if (finalStatus === 'done') {
      await client.query(
        `UPDATE tasks SET 
          title = $1, 
          description = $2, 
          deadline = $3, 
          assigned_to = $4,
          tarih = $5,
          konu_sorumlusu = $6,
          sorumlu_2 = $7,
          sorumlu_3 = $8,
          bolge = $9,
          il = $10,
          belediye = $11,
          departman = $12,
          arsiv = $13,
          verilen_is_tarihi = $14,
          acil = $15,
          status = $16,
          task_subject = $17,
          completed_at = CURRENT_TIMESTAMP
        WHERE id = $18`,
        [
          updatedTitle, 
          updatedDescription, 
          updatedDeadline || null, 
          updatedAssignedTo,
          updatedTarih || null,
          konu_sorumlusu || null,
          sorumlu_2 || null,
          sorumlu_3 || null,
          updatedBolge || null,
          updatedIl || null,
          updatedBelediye || null,
          updatedDepartman || null,
          updatedArsiv || 'YOK',
          updatedVerilenIsTarihi || null,
          updatedAcil,
          finalStatus,
          updatedTaskSubject || null,
          taskId
        ]
      );
    } else {
      await client.query(
        `UPDATE tasks SET 
          title = $1, 
          description = $2, 
          deadline = $3, 
          assigned_to = $4,
          tarih = $5,
          konu_sorumlusu = $6,
          sorumlu_2 = $7,
          sorumlu_3 = $8,
          bolge = $9,
          il = $10,
          belediye = $11,
          departman = $12,
          arsiv = $13,
          verilen_is_tarihi = $14,
          acil = $15,
          status = $16,
          task_subject = $17,
          completed_at = NULL
        WHERE id = $18`,
        [
          updatedTitle, 
          updatedDescription, 
          updatedDeadline || null, 
          updatedAssignedTo,
          updatedTarih || null,
          konu_sorumlusu || null,
          sorumlu_2 || null,
          sorumlu_3 || null,
          updatedBolge || null,
          updatedIl || null,
          updatedBelediye || null,
          updatedDepartman || null,
          updatedArsiv || 'YOK',
          updatedVerilenIsTarihi || null,
          updatedAcil,
          finalStatus,
          updatedTaskSubject || null,
          taskId
        ]
      );
    }

    // Insert files if any
    const files = req.files || [];
    if (files.length) {
      for (const file of files) {
        // Normalize filename encoding for database storage
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        await client.query(
          'INSERT INTO task_files (task_id, uploader_id, filename, original_name, mime_type, uploaded_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
          [taskId, req.user.id, file.filename, originalName, file.mimetype]
        );
      }
    }

    // Notify all involved users about task update
    const actor = req.user && req.user.username ? req.user.username : 'Admin';
    const updateMessage = `Görev güncellendi (by ${actor}): ${title}`;
    
    // Collect all user IDs to notify
    const userIdsToNotify = new Set();
    
    // Add assigned_to
    if (updatedAssignedTo) userIdsToNotify.add(Number(updatedAssignedTo));
    
    // Add sorumlu_2
    if (sorumlu_2 && sorumlu_2 !== '') userIdsToNotify.add(Number(sorumlu_2));
    
    // Add sorumlu_3
    if (sorumlu_3 && sorumlu_3 !== '') userIdsToNotify.add(Number(sorumlu_3));
    
    // Add konu_sorumlusu
    if (konu_sorumlusu && konu_sorumlusu !== '') {
      const konuSorumlusuId = parseInt(konu_sorumlusu);
      if (!isNaN(konuSorumlusuId)) userIdsToNotify.add(konuSorumlusuId);
    }

    // Also notify old assigned users if they changed
    if (oldTask) {
      if (oldTask.assigned_to) userIdsToNotify.add(Number(oldTask.assigned_to));
      if (oldTask.sorumlu_2) userIdsToNotify.add(Number(oldTask.sorumlu_2));
      if (oldTask.sorumlu_3) userIdsToNotify.add(Number(oldTask.sorumlu_3));
      if (oldTask.konu_sorumlusu) {
        const oldKonuSorumlusuId = parseInt(oldTask.konu_sorumlusu);
        if (!isNaN(oldKonuSorumlusuId)) userIdsToNotify.add(oldKonuSorumlusuId);
      }
    }

    // Send notifications to all involved users
    for (const userId of userIdsToNotify) {
      if (userId && userId !== req.user.id) { // Don't notify the updater
        await addNotification(userId, updateMessage, 'task_updated', taskId);
      }
    }

    await client.query('COMMIT');
    res.redirect(`/admin/tasks/${taskId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.sendStatus(500);
  } finally {
    client.release();
  }
});

// Update task with note and files (admin)
router.post('/tasks/:id/update', upload.array('attachments', 20), async (req, res) => {
  const taskId = req.params.id;
  const { status, note, completed_at } = req.body;
  const allowed = ['pending', 'in_progress', 'done'];
  if (!allowed.includes(status)) {
    return res.redirect(`/admin/tasks/${taskId}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update task status and set completed_at when status is 'done'
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

    // Save update history
    const updateResult = await client.query(
      'INSERT INTO task_updates (task_id, user_id, status, note, created_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING id',
      [taskId, req.user.id, status, note || null]
    );

    const updateId = updateResult.rows[0]?.id;

    // Insert files if any
    const files = req.files || [];
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

    // Build notification message
    const statusText =
      status === 'done'
        ? 'Tamamlandı'
        : status === 'in_progress'
        ? 'Devam ediyor'
        : 'Beklemede';
    const actor = req.user && req.user.username ? req.user.username : 'Admin';
    const baseMessage = `Admin (${actor}) görev durumunu güncelledi (ID: ${taskId}) - Durum: ${statusText}`;
    let fullMessage =
      note && note.trim().length ? `${baseMessage} - Not: ${note.trim()}` : baseMessage;

    if (files.length) {
      fullMessage += ` - Ek: ${files.length} dosya yüklendi`;
    }

    // Get task details to notify all involved users
    const taskResult = await client.query(`
      SELECT assigned_to, sorumlu_2, sorumlu_3, konu_sorumlusu 
      FROM tasks 
      WHERE id = $1
    `, [taskId]);
    
    const task = taskResult.rows[0];
    const userIdsToNotify = new Set();
    
    // Add all involved users
    if (task) {
      if (task.assigned_to) userIdsToNotify.add(Number(task.assigned_to));
      if (task.sorumlu_2) userIdsToNotify.add(Number(task.sorumlu_2));
      if (task.sorumlu_3) userIdsToNotify.add(Number(task.sorumlu_3));
      if (task.konu_sorumlusu) {
        const konuSorumlusuId = parseInt(task.konu_sorumlusu);
        if (!isNaN(konuSorumlusuId)) userIdsToNotify.add(konuSorumlusuId);
      }
    }

    // Notify all involved users (except the updater)
    for (const userId of userIdsToNotify) {
      if (userId && userId !== req.user.id) {
        await addNotification(userId, fullMessage, 'task_update', taskId);
      }
    }

    await client.query('COMMIT');
    res.redirect(`/admin/tasks/${taskId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating task', err);
    res.sendStatus(500);
  } finally {
    client.release();
  }
});

// Update task status (admin) - simple status change only
router.post('/tasks/:id/status', async (req, res) => {
  const taskId = req.params.id;
  const { status } = req.body;
  const allowed = ['pending', 'in_progress', 'done', 'onemli'];
  if (!allowed.includes(status)) {
    return res.redirect(`/admin/tasks/${taskId}`);
  }

  try {
    // Update task status and set completed_at when status is 'done'
    if (status === 'done') {
      await pool.query('UPDATE tasks SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2', [status, taskId]);
    } else {
      await pool.query('UPDATE tasks SET status = $1, completed_at = NULL WHERE id = $2', [status, taskId]);
    }
    
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

// Translate endpoint
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
