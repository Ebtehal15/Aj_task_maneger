-- Users tablosuna email alanı ekle
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Email için index ekle (opsiyonel, performans için)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

