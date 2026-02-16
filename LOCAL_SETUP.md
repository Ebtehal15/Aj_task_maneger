# Localhost Kurulum Rehberi

Bu rehber, uygulamayı localhost'ta çalıştırmak için gerekli adımları içerir.

## Gereksinimler

1. **Node.js** (v14 veya üzeri)
2. **PostgreSQL** (v12 veya üzeri)
3. **npm** veya **yarn**

## Adım 1: PostgreSQL Kurulumu ve Veritabanı Oluşturma

1. PostgreSQL'in kurulu olduğundan emin olun
2. PostgreSQL'e bağlanın:
   ```bash
   psql -U postgres
   ```
3. Veritabanı oluşturun:
   ```sql
   CREATE DATABASE task_manager;
   \q
   ```

## Adım 2: Environment Variables Ayarlama

Proje kök dizininde `.env` dosyası oluşturun:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=task_manager
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_SSL=false

# Session Secret (güvenli bir değer kullanın)
SESSION_SECRET=your-super-secret-key-change-this-in-production

# Port (opsiyonel, varsayılan: 3000)
PORT=3000

# Node Environment
NODE_ENV=development
```

**Önemli:** `.env` dosyasını `.gitignore`'a ekleyin (zaten ekli olmalı).

## Adım 3: Bağımlılıkları Yükleme

```bash
npm install
```

## Adım 4: Uygulamayı Başlatma

### Development Mode (otomatik yeniden başlatma):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

## Adım 5: Uygulamaya Erişim

Tarayıcınızda şu adrese gidin:
```
http://localhost:3000
```

## Varsayılan Kullanıcılar

Uygulama ilk başlatıldığında otomatik olarak şu kullanıcılar oluşturulur:

- **Admin:**
  - Username: `admin`
  - Password: `admin123`

- **User:**
  - Username: `user`
  - Password: `user123`

**Güvenlik Uyarısı:** Production ortamında mutlaka bu şifreleri değiştirin!

## Sorun Giderme

### PostgreSQL Bağlantı Hatası

1. PostgreSQL servisinin çalıştığından emin olun:
   ```bash
   # Windows
   services.msc
   # PostgreSQL servisini kontrol edin
   ```

2. `pg_hba.conf` dosyasını kontrol edin (genellikle `C:\Program Files\PostgreSQL\[version]\data\pg_hba.conf`)
   - `localhost` için `trust` veya `scram-sha-256` ayarını kontrol edin

3. `postgresql.conf` dosyasında `listen_addresses = 'localhost'` olduğundan emin olun

### Port Zaten Kullanılıyor

Eğer port 3000 zaten kullanılıyorsa:

1. Farklı bir port kullanın (`.env` dosyasında `PORT=3001` gibi)
2. Veya port 3000'i kullanan işlemi kapatın:
   ```bash
   # Windows PowerShell
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```

### Database Schema Hatası

Eğer veritabanı şeması oluşturulmazsa, uygulama otomatik olarak oluşturur. İlk başlatmada biraz zaman alabilir.

## Development İpuçları

- `nodemon` kullanıyorsanız, dosya değişikliklerinde otomatik yeniden başlatma yapılır
- Log'ları konsolda görebilirsiniz
- Database bağlantı durumunu log'larda kontrol edebilirsiniz

## Production'a Geçiş

Production ortamında:

1. `SESSION_SECRET` için güçlü bir değer kullanın
2. `NODE_ENV=production` ayarlayın
3. Database şifrelerini güvenli tutun
4. HTTPS kullanın
5. Varsayılan kullanıcı şifrelerini değiştirin


