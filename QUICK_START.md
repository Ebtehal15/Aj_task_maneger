# Hızlı Başlangıç - Adım Adım

PostgreSQL kurulumu tamamlandı! Şimdi uygulamayı çalıştırmak için şu adımları takip edin:

**Not:** Eğer PostgreSQL kurulumunda sorun yaşıyorsanız, `REINSTALL_POSTGRESQL.md` dosyasına bakın.

## 📋 Adım 1: Veritabanını Oluşturun

### Yöntem 1: Otomatik Script (Önerilen - En Kolay)

PowerShell'i **proje klasöründe** açın ve şu komutu çalıştırın:

```powershell
.\check_postgres.ps1
```

Script otomatik olarak:
- PostgreSQL'in kurulu olduğunu kontrol eder
- Doğru yolu bulur
- Veritabanını UTF-8 encoding ile oluşturur

**Şifre isteyecek:** Kurulum sırasında belirlediğiniz PostgreSQL şifresini girin.

---

### Yöntem 2: Manuel - Tam Yol ile

**Önce PostgreSQL sürümünüzü bulun:**
1. Windows Explorer'da `C:\Program Files\PostgreSQL\` klasörüne gidin
2. Hangi sürümün kurulu olduğunu görün (16, 15, 14, vb.)

**PowerShell'de tam yol ile çalıştırın:**

```powershell
# PostgreSQL 16 için:
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres

# PostgreSQL 15 için:
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres

# PostgreSQL 14 için:
& "C:\Program Files\PostgreSQL\14\bin\psql.exe" -U postgres
```

**Şifre isteyecek:** Kurulum sırasında belirlediğiniz PostgreSQL şifresini girin.

**Veritabanını UTF-8 encoding ile oluşturun:**

```sql
CREATE DATABASE task_manager 
  WITH ENCODING 'UTF8' 
  LC_COLLATE='en_US.UTF-8' 
  LC_CTYPE='en_US.UTF-8'
  TEMPLATE=template0;
```

**Çıkış yapın:**

```sql
\q
```

---

### Yöntem 3: PATH'e Ekleme (Kalıcı Çözüm)

Eğer sık kullanacaksanız PATH'e ekleyin:

1. **Windows + R** → `sysdm.cpl` → Enter
2. **Advanced** → **Environment Variables**
3. **System variables** → **Path** → **Edit** → **New**
4. PostgreSQL bin klasörünü ekleyin:
   ```
   C:\Program Files\PostgreSQL\16\bin
   ```
   (16 yerine kurulu sürümünüzü yazın)
5. **OK** → PowerShell'i kapatıp yeniden açın
6. Artık `psql -U postgres` komutu çalışacak

**Detaylı rehber:** `FIX_PSQL_PATH.md`

---

### Yöntem 4: pgAdmin 4 (GUI - Alternatif)

Eğer pgAdmin 4 kuruluysa:

1. **pgAdmin 4**'ü açın
2. Sol tarafta **"Servers"** → **"PostgreSQL 16"** (veya sürümünüz) genişletin
3. **"Databases"** üzerine sağ tıklayın → **"Create"** → **"Database..."**
4. **"Database"** alanına: `task_manager` yazın
5. **"Definition"** sekmesine gidin:
   - **"Encoding"**: `UTF8` seçin
   - **"LC_COLLATE"**: `en_US.UTF-8` yazın
   - **"LC_CTYPE"**: `en_US.UTF-8` yazın
6. **"Save"** tıklayın

---

## 📋 Adım 2: .env Dosyası Oluşturun

Proje klasöründe (task_maneger) `.env` dosyası oluşturun:

### Windows'ta:

1. Proje klasöründe sağ tıklayın → **Yeni** → **Metin Belgesi**
2. Dosya adını `.env` yapın (uzantı olmadan)
3. İçine şunu yazın:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Session Secret (güçlü bir rastgele string oluşturun)
SESSION_SECRET=your-super-secret-key-change-this-in-production

# Application Base URL
APP_BASE_URL=http://localhost:3000

# PostgreSQL Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=task_manager
DB_USER=postgres
DB_PASSWORD=kurulumda-belirlediginiz-postgres-sifresi
DB_SSL=false

# Email Configuration (Opsiyonel - şimdilik atlayabilirsiniz)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password
# MAIL_FROM=no-reply@yourdomain.com
```

**Önemli:** 
- `DB_PASSWORD` kısmına kurulum sırasında belirlediğiniz PostgreSQL şifresini yazın
- `SESSION_SECRET` için güçlü bir rastgele string oluşturun (aşağıdaki komutla)

### SESSION_SECRET Oluşturma:

PowerShell'de:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Çıktıyı kopyalayıp `.env` dosyasındaki `SESSION_SECRET=` kısmına yapıştırın.

---

## 📋 Adım 3: Bağımlılıkları Yükleyin

Proje klasöründe PowerShell veya Command Prompt açın:

```bash
npm install
```

Bu işlem birkaç dakika sürebilir.

---

## 📋 Adım 4: Uygulamayı Başlatın

```bash
npm start
```

**İlk çalıştırmada:**
- Veritabanı tabloları otomatik oluşturulacak
- Varsayılan admin kullanıcısı eklenecek
- Konsolda şu mesajı göreceksiniz:
  ```
  Task manager app running on http://localhost:3000
  Default admin created: username=admin, password=admin123
  ```

---

## 📋 Adım 5: Uygulamaya Erişin

Tarayıcınızda şu adrese gidin:

```
http://localhost:3000
```

**Varsayılan Giriş Bilgileri:**
- **Kullanıcı adı:** `admin`
- **Şifre:** `admin123`

---

## ✅ Kontrol Listesi

- [ ] PostgreSQL servisi çalışıyor ✓
- [ ] Veritabanı oluşturuldu (`task_manager`)
- [ ] `.env` dosyası oluşturuldu ve yapılandırıldı
- [ ] `npm install` tamamlandı
- [ ] `npm start` ile uygulama başlatıldı
- [ ] Tarayıcıda `http://localhost:3000` açıldı
- [ ] Admin kullanıcısı ile giriş yapıldı

---

## 🆘 Sorun Giderme

### "psql: command not found" hatası

PostgreSQL'in `bin` klasörünü PATH'e ekleyin:
- Genellikle: `C:\Program Files\PostgreSQL\18\bin` (sürümünüze göre)
- Windows + R → `sysdm.cpl` → Environment Variables → Path'e ekleyin
- **Veya** tam yol ile: `& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres`

**Detaylı rehber:** `FIX_PSQL_PATH.md`

### "Connection refused" hatası

PostgreSQL servisi çalışmıyor olabilir:

```powershell
# Servis durumunu kontrol et
Get-Service postgresql*

# Servisi başlat (sürümünüze göre)
Start-Service postgresql-x64-18
```

**Detaylı rehber:** `FIX_POSTGRES_CONNECTION.md`

### "password authentication failed" hatası

- `.env` dosyasındaki `DB_PASSWORD` değerini kontrol edin
- PostgreSQL şifresini doğru yazdığınızdan emin olun

### "database does not exist" hatası

- Veritabanını oluşturduğunuzdan emin olun (Adım 1)
- Veritabanı adını kontrol edin: `task_manager`

### Port 3000 zaten kullanılıyor

`.env` dosyasında farklı bir port seçin:
```env
PORT=3001
```

### Tablolar oluşturulmadı

- İlk çalıştırmada tablolar otomatik oluşur
- Hata mesajlarını kontrol edin
- Veritabanı bağlantı bilgilerini kontrol edin

---

## 🎉 Başarılı!

Uygulama çalışıyorsa:
- Görev oluşturabilirsiniz
- Kullanıcı ekleyebilirsiniz
- Dosya yükleyebilirsiniz
- Bildirimleri görebilirsiniz

**Sonraki Adımlar:**
- Production'a deploy etmek için: `DEPLOYMENT.md`
- Aynı sunucuda birden fazla uygulama: `MULTI_APP_SETUP.md`

