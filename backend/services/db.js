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
  console.log('  DB_HOST:', process.env.DB_HOST || '❌ Not set (using default: localhost)');
  console.log('  DB_PORT:', process.env.DB_PORT || '❌ Not set (using default: 5432)');
  console.log('  DB_NAME:', process.env.DB_NAME || '❌ Not set (using default: task_manager)');
  console.log('  DB_USER:', process.env.DB_USER || '❌ Not set (using default: postgres)');
  console.log('  DB_PASSWORD:', process.env.DB_PASSWORD ? '✅ Set' : '❌ Not set (using default)');
  console.log('  DB_SSL:', process.env.DB_SSL || '❌ Not set');
  
  if (process.env.DATABASE_URL) {
    // Render'ın Internal Database URL'i kullanılıyor
    console.log('✅ Using DATABASE_URL connection string');
    config = {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' || process.env.DATABASE_URL.includes('render.com') 
        ? { rejectUnauthorized: false } 
        : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      client_encoding: 'UTF8'
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
      client_encoding: 'UTF8'
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
    console.error('Unexpected error on idle client', err);
  });

  // Initialize database schema
  initSchema();

  return pool;
}

async function initSchema() {
  const client = await pool.connect();
  try {
    // Ensure UTF-8 encoding for the session
    await client.query("SET client_encoding TO 'UTF8'");
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
        role VARCHAR(50) NOT NULL CHECK(role IN ('admin','user')),
        email VARCHAR(255)
      )
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

    // Seed default admin if not exists
    const adminCheck = await client.query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['admin']);
    if (parseInt(adminCheck.rows[0].count) === 0) {
      const passwordHash = bcrypt.hashSync('admin123', 10);
      await client.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
        ['admin', passwordHash, 'admin']
      );
      console.log('Default admin created: username=admin, password=admin123');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing database schema', err);
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
