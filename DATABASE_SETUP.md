# PostgreSQL Veritabanı Kurulumu

Bu proje artık PostgreSQL veritabanı kullanıyor. Bu rehber, yerel ve production ortamında PostgreSQL'i nasıl kuracağınızı açıklar.

## 🏠 Yerel Kurulum

### 1. PostgreSQL Kurulumu

#### Windows:
1. [PostgreSQL Windows installer](https://www.postgresql.org/download/windows/) indirin
2. Kurulum sırasında bir şifre belirleyin (varsayılan kullanıcı: `postgres`)

#### macOS:
```bash
# Homebrew ile
brew install postgresql@14
brew services start postgresql@14
```

#### Linux (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 2. Veritabanı Oluşturma

```bash
# PostgreSQL'e bağlan
psql -U postgres

# Veritabanı oluştur (UTF-8 encoding ile - Arapça/İngilizce karakter desteği için)
CREATE DATABASE task_manager 
  WITH ENCODING 'UTF8' 
  LC_COLLATE='en_US.UTF-8' 
  LC_CTYPE='en_US.UTF-8'
  TEMPLATE=template0;

# Çıkış
\q
```

**Önemli:** UTF-8 encoding, Arapça ve İngilizce karakterlerin doğru şekilde saklanması için kritiktir. PostgreSQL varsayılan olarak UTF-8 kullanır, ancak açıkça belirtmek en iyi pratiktir.

### 3. Environment Variables

`.env` dosyasını oluşturun:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=task_manager
DB_USER=postgres
DB_PASSWORD=your-postgres-password
DB_SSL=false
```

### 4. Uygulamayı Başlatma

```bash
npm install
npm start
```

Uygulama ilk çalıştığında otomatik olarak tüm tabloları oluşturacaktır.

## ☁️ Production Kurulumu

### Render.com

1. Render dashboard'da "New +" → "PostgreSQL" seçin
2. Veritabanı ayarlarını yapın
3. Environment Variables'da otomatik olarak eklenen değişkenleri kullanın:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_NAME`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_SSL=true` (production için)

### Railway

1. Railway'de projenize "New" → "Database" → "Add PostgreSQL" seçin
2. Railway otomatik olarak environment variables ekler
3. `DB_SSL=true` ekleyin

### Heroku

```bash
# Heroku Postgres addon ekle
heroku addons:create heroku-postgresql:mini

# Environment variables otomatik eklenir
# Sadece DB_SSL=true ekleyin
heroku config:set DB_SSL=true
```

### DigitalOcean

1. DigitalOcean dashboard'da "Databases" → "Create Database Cluster"
2. PostgreSQL seçin
3. Connection details'i environment variables olarak ekleyin

## 🔄 SQLite'dan PostgreSQL'e Geçiş (Mevcut Veriler İçin)

Eğer SQLite veritabanınızdan veri taşımak istiyorsanız:

### 1. SQLite Verilerini Export Et

```bash
# SQLite veritabanını SQL formatına çevir
sqlite3 backend/data/app.db .dump > dump.sql
```

### 2. SQL'i PostgreSQL Formatına Dönüştür

SQLite ve PostgreSQL arasında bazı farklar var:
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `TEXT` → `VARCHAR` veya `TEXT`
- `INTEGER` (boolean) → `BOOLEAN`
- `date()` fonksiyonları farklı

Manuel olarak düzenlemeniz gerekebilir.

### 3. PostgreSQL'e Import Et

```bash
psql -U postgres -d task_manager -f dump.sql
```

## 🛠️ Veritabanı Yönetimi

### Tabloları Görüntüleme

```bash
psql -U postgres -d task_manager

# Tabloları listele
\dt

# Bir tablonun yapısını gör
\d users

# Çıkış
\q
```

### Backup Alma

```bash
# Tam backup
pg_dump -U postgres -d task_manager > backup.sql

# Sadece veri (schema olmadan)
pg_dump -U postgres -d task_manager --data-only > data.sql

# Sadece schema (veri olmadan)
pg_dump -U postgres -d task_manager --schema-only > schema.sql
```

### Backup'tan Geri Yükleme

```bash
psql -U postgres -d task_manager < backup.sql
```

## 🌐 UTF-8 ve Çok Dilli Destek

PostgreSQL varsayılan olarak UTF-8 encoding kullanır ve Arapça karakterleri mükemmel şekilde destekler. Kod otomatik olarak:

- Connection'da `client_encoding: 'UTF8'` ayarlar
- Tüm TEXT ve VARCHAR alanları UTF-8 karakterlerini destekler
- RTL (Right-to-Left) metinler doğru şekilde saklanır ve gösterilir

**Görev açıklamaları ve bildirim mesajları** Arapça karakterlerle sorunsuz çalışır.

## 📁 Dosya Yükleme Mimarisi

Proje, dosyaları veritabanına BLOB olarak kaydetmek yerine:

1. **Dosyalar** `backend/uploads/` klasörüne kaydedilir (veya production'da S3/Cloudinary)
2. **Veritabanında** sadece dosya yolu (filename) ve metadata saklanır:
   - `filename`: Sunucudaki dosya adı
   - `original_name`: Kullanıcının yüklediği orijinal dosya adı
   - `mime_type`: Dosya tipi
   - `uploaded_at`: Yükleme zamanı

Bu yaklaşım:
- ✅ Veritabanı performansını artırır
- ✅ Dosya sorgularını hızlandırır
- ✅ Veritabanı boyutunu küçültür
- ✅ Dosya yönetimini kolaylaştırır

## 🔔 Bildirim Sistemi Optimizasyonu

Bildirim sistemi PostgreSQL'in güçlü özelliklerini kullanır:

- **`is_read BOOLEAN`**: Okundu/okunmadı durumu için boolean tipi (INTEGER yerine)
- **`created_at TIMESTAMP`**: Zaman damgası ile otomatik sıralama
- **Index'ler**: `user_id` ve `is_read` alanlarında index'ler performansı artırır

Örnek sorgu:
```sql
-- Okunmamış bildirimleri hızlıca getir
SELECT * FROM notifications 
WHERE user_id = $1 AND is_read = FALSE 
ORDER BY created_at DESC;
```

## 🔍 Sorun Giderme

### Bağlantı Hatası

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Çözüm:**
- PostgreSQL servisinin çalıştığından emin olun
- `DB_HOST` ve `DB_PORT` değerlerini kontrol edin
- Firewall ayarlarını kontrol edin

### Authentication Hatası

```
Error: password authentication failed
```

**Çözüm:**
- `DB_USER` ve `DB_PASSWORD` değerlerini kontrol edin
- PostgreSQL kullanıcı şifresini sıfırlayın

### SSL Hatası (Production)

```
Error: self signed certificate
```

**Çözüm:**
- `DB_SSL=true` ayarlayın
- Kod zaten `rejectUnauthorized: false` kullanıyor (production için güvenli)

## 📊 Performans İpuçları

1. **Connection Pooling:** Kod zaten connection pooling kullanıyor (max: 20 connections)
2. **Indexes:** Veritabanı şeması otomatik olarak önemli alanlarda index oluşturuyor
3. **Query Optimization:** JOIN'ler ve WHERE clause'lar optimize edildi

## ✅ Kontrol Listesi

- [ ] PostgreSQL kuruldu
- [ ] Veritabanı oluşturuldu
- [ ] `.env` dosyası yapılandırıldı
- [ ] Uygulama başarıyla başladı
- [ ] Tablolar otomatik oluşturuldu
- [ ] Test kullanıcısı ile giriş yapıldı
- [ ] Görev oluşturma/test edildi

