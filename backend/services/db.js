const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool;

function initDb() {
  if (pool) {
    return pool;
  }

  // PostgreSQL connection configuration
  // Render'da DATABASE_URL kullanılıyorsa onu parse et
  let config;
  
  // Debug: Environment variables kontrolü
  console.log('🔍 Database Config Check:');
  console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Not set');
  
  if (process.env.DATABASE_URL) {
    // DATABASE_URL varsa, içeriğini kontrol et (şifreyi gizle)
    const urlForLog = process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@');
    console.log('  DATABASE_URL (masked):', urlForLog);
    console.log('  DATABASE_URL includes render.com:', process.env.DATABASE_URL.includes('render.com') ? '✅ Yes' : '❌ No');
    console.log('  DATABASE_URL includes postgresql://:', process.env.DATABASE_URL.startsWith('postgresql://') ? '✅ Yes' : '❌ No');
    console.log('  DATABASE_URL includes port:', process.env.DATABASE_URL.includes(':5432') ? '✅ Yes' : '❌ No');
  } else {
    console.log('  DB_HOST:', process.env.DB_HOST || '❌ Not set (using default: localhost)');
    console.log('  DB_PORT:', process.env.DB_PORT || '❌ Not set (using default: 5432)');
    console.log('  DB_NAME:', process.env.DB_NAME || '❌ Not set (using default: task_manager)');
    console.log('  DB_USER:', process.env.DB_USER || '❌ Not set (using default: postgres)');
    console.log('  DB_PASSWORD:', process.env.DB_PASSWORD ? '✅ Set' : '❌ Not set (using default)');
  }
  console.log('  DB_SSL:', process.env.DB_SSL || '❌ Not set');
  
  if (process.env.DATABASE_URL) {
    // Render'ın Internal Database URL'i kullanılıyor
    console.log('✅ Using DATABASE_URL connection string');
    const sslEnabled = process.env.DB_SSL === 'true' || process.env.DATABASE_URL.includes('render.com');
    console.log('  SSL enabled:', sslEnabled ? '✅ Yes' : '❌ No');
    config = {
      connectionString: process.env.DATABASE_URL,
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      client_encoding: 'UTF8',
      options: '-c timezone=Europe/Istanbul'
    };
  } else {
    // Ayrı environment variables kullanılıyor
    console.log('⚠️  Using individual DB environment variables (or defaults)');
    config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'task_manager',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      // Ensure UTF-8 encoding for Arabic/English text support
      client_encoding: 'UTF8',
      options: '-c timezone=Europe/Istanbul'
    };
    console.log('📝 Connecting to:', {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      ssl: config.ssl ? 'enabled' : 'disabled'
    });
  }

  pool = new Pool(config);

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
  });

  // PostgreSQL timezone ayarını yap
  pool.query('SET timezone = \'Europe/Istanbul\'').catch((err) => {
    console.error('⚠️  Timezone ayarı hatası (non-fatal):', err.message);
  });

  // Initialize database schema (async, but don't block)
  initSchema().catch((err) => {
    console.error('❌ Failed to initialize database schema:', err);
    // Don't throw - let the app start and retry on first request
  });

  return pool;
}

async function initSchema() {
  const client = await pool.connect();
  try {
    // Ensure UTF-8 encoding for the session
    await client.query("SET client_encoding TO 'UTF8'");
    // Set timezone to Turkey (Europe/Istanbul)
    await client.query("SET timezone = 'Europe/Istanbul'");
    await client.query('BEGIN');

    // Create session table for connect-pg-simple (if not exists)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      )
      WITH (OIDS=FALSE)
    `);
    
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN
          ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
        END IF;
      END $$;
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
    `);

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(50) NOT NULL CHECK(role IN ('super_admin','user','admin','system_admin')),
        email VARCHAR(255)
      )
    `);
    
    // Migrate existing user roles BEFORE updating constraint
    // Update existing CHECK constraint to include new roles if it exists
    await client.query(`
      DO $$ 
      BEGIN 
        -- Drop old constraint if exists and create new one with updated roles
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'users_role_check' 
          AND contype = 'c'
        ) THEN
          ALTER TABLE users DROP CONSTRAINT users_role_check;
        END IF;
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('super_admin','user','admin','system_admin'));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Add email column if it doesn't exist (for existing databases)
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='users' AND column_name='email') THEN
          ALTER TABLE users ADD COLUMN email VARCHAR(255);
        END IF;
      END $$;
    `);

    // Add avatar column if it doesn't exist (for existing databases)
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='users' AND column_name='avatar') THEN
          ALTER TABLE users ADD COLUMN avatar VARCHAR(500);
        END IF;
      END $$;
    `);

    // Create tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        deadline TIMESTAMP,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        assigned_to INTEGER NOT NULL,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Add new columns to tasks table if they don't exist
    await client.query(`
      DO $$ 
      BEGIN 
        -- Tarih (Form Date)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='tarih') THEN
          ALTER TABLE tasks ADD COLUMN tarih DATE;
        END IF;
        
        -- Konu Sorumlusu (Subject Responsible)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='konu_sorumlusu') THEN
          ALTER TABLE tasks ADD COLUMN konu_sorumlusu VARCHAR(100);
        END IF;
        
        -- Sorumlu 2 (Second Responsible)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='sorumlu_2') THEN
          ALTER TABLE tasks ADD COLUMN sorumlu_2 INTEGER;
          ALTER TABLE tasks ADD CONSTRAINT fk_sorumlu_2 FOREIGN KEY (sorumlu_2) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        
        -- Sorumlu 3 (Third Responsible)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='sorumlu_3') THEN
          ALTER TABLE tasks ADD COLUMN sorumlu_3 INTEGER;
          ALTER TABLE tasks ADD CONSTRAINT fk_sorumlu_3 FOREIGN KEY (sorumlu_3) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        
        -- Bölge (Region)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='bolge') THEN
          ALTER TABLE tasks ADD COLUMN bolge VARCHAR(100);
        END IF;
        
        -- İl (City)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='il') THEN
          ALTER TABLE tasks ADD COLUMN il VARCHAR(100);
        END IF;
        
        -- Belediye (Municipality)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='belediye') THEN
          ALTER TABLE tasks ADD COLUMN belediye VARCHAR(100);
        END IF;
        
        -- Departman (Department)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='departman') THEN
          ALTER TABLE tasks ADD COLUMN departman VARCHAR(50);
        END IF;
        
        -- Arşiv (Archive)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='arsiv') THEN
          ALTER TABLE tasks ADD COLUMN arsiv VARCHAR(10) DEFAULT 'YOK';
        END IF;
        
        -- Verilen İş Tarihi (Given Job Date)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='verilen_is_tarihi') THEN
          ALTER TABLE tasks ADD COLUMN verilen_is_tarihi DATE;
        END IF;
        
        -- Acil (Urgent)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='acil') THEN
          ALTER TABLE tasks ADD COLUMN acil BOOLEAN DEFAULT false;
        END IF;
        
        -- Tamamlanma Tarihi (Completion Date)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='completed_at') THEN
          ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMP;
        END IF;
        
        -- İş Konusu (Task Subject)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='task_subject') THEN
          ALTER TABLE tasks ADD COLUMN task_subject TEXT;
        END IF;
        
        -- Yönetici Takip (System admin only - Evet/Hayır)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tasks' AND column_name='yonetici_kontrol') THEN
          ALTER TABLE tasks ADD COLUMN yonetici_kontrol BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);

    // Create municipalities table
    await client.query(`
      CREATE TABLE IF NOT EXISTS municipalities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create regions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS regions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create cities table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create task_files table
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_files (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL,
        uploader_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT,
        uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_id INTEGER,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50),
        related_task_id INTEGER,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create task_updates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_updates (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL,
        note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Geciken görevler raporu: görev kaydını değiştirmeden, sadece bu sayfada gösterilen notlar
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_overdue_list_notes (
        task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
        note TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
      CREATE INDEX IF NOT EXISTS idx_task_files_task_id ON task_files(task_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    await client.query('COMMIT');

    // Seed default admin if not exists (outside transaction for safety)
    try {
      const adminCheck = await client.query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['super_admin']);
      if (parseInt(adminCheck.rows[0].count) === 0) {
        const passwordHash = bcrypt.hashSync('admin123', 10);
        await client.query(
          'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
          ['admin', passwordHash, 'super_admin']
        );
        console.log('✅ Default admin created: username=admin, password=admin123');
      } else {
        console.log('ℹ️  Admin user already exists');
      }
    } catch (adminErr) {
      console.error('⚠️  Warning: Could not create default admin user:', adminErr.message);
      // Don't throw - app can still run, admin might exist
    }

    // Seed sistem yöneticisi (system_admin) - sadece kod tarafından atanır, tek kullanıcı
    const SYSTEM_ADMIN_USERNAME = 'sysadmin';
    const SYSTEM_ADMIN_PASSWORD = 'SysAdmin!2025';
    try {
      const sysAdminCheck = await client.query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['system_admin']);
      if (parseInt(sysAdminCheck.rows[0].count) === 0) {
        const passwordHash = bcrypt.hashSync(SYSTEM_ADMIN_PASSWORD, 10);
        await client.query(
          'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
          [SYSTEM_ADMIN_USERNAME, passwordHash, 'system_admin']
        );
        console.log('✅ Sistem yöneticisi oluşturuldu: kullanıcı adı=%s, şifre=%s (ilk girişte değiştirin)', SYSTEM_ADMIN_USERNAME, SYSTEM_ADMIN_PASSWORD);
      } else {
        console.log('ℹ️  Sistem yöneticisi kullanıcısı zaten mevcut');
      }
    } catch (sysAdminErr) {
      console.error('⚠️  Warning: Could not create system admin user:', sysAdminErr.message);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing database schema', err);
    throw err;
  } finally {
    client.release();
  }
}

function getDb() {
  // Lazy initialization to avoid "Database not initialized" errors
  if (!pool) {
    initDb();
  }
  return pool;
}

// Helper function to execute queries with error handling
async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } catch (err) {
    console.error('Database query error', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  initDb,
  getDb,
  query
};
