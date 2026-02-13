# Projeyi Online'a Taşıma Rehberi

Bu rehber, Task Manager projenizi çeşitli platformlara nasıl deploy edeceğinizi açıklar.

## 📋 Ön Hazırlık

### 1. Git Repository Oluşturma

```bash
# Git repository başlat
git init
git add .
git commit -m "Initial commit"

# GitHub/GitLab'a push edin
git remote add origin <your-repo-url>
git push -u origin main
```

### 2. Environment Variables

`.env.example` dosyasını `.env` olarak kopyalayın ve değerleri doldurun:

```bash
cp .env.example .env
```

**Önemli:** `.env` dosyasını asla Git'e commit etmeyin!

## 🚀 Deployment Seçenekleri

### Seçenek 1: Render (Önerilen - Ücretsiz Plan Var)

**Detaylı adım adım rehber için:** **[RENDER_DEPLOY.md](./RENDER_DEPLOY.md)**

**Hızlı Özet:**

1. [Render.com](https://render.com) hesabı oluşturun
2. **PostgreSQL Database** oluşturun (önce database!)
3. **Web Service** oluşturun
4. **Environment Variables** ekleyin:
   - `NODE_ENV=production`
   - `SESSION_SECRET=<güçlü-rastgele-string>`
   - `APP_BASE_URL=https://your-app.onrender.com`
   - PostgreSQL bağlantı bilgileri
   - Email ayarları (opsiyonel)
5. Deploy edin

**Not:** Render'da ücretsiz plan kullanıyorsanız, 15 dakika kullanılmadığında uygulama uyku moduna geçer.

---

### Seçenek 2: Railway

1. [Railway.app](https://railway.app) hesabı oluşturun
2. "New Project" → "Deploy from GitHub repo" seçin
3. Repository'nizi seçin
4. Railway otomatik olarak `railway.json` dosyasını kullanacak
5. Environment Variables ekleyin (Settings → Variables):
   - `SESSION_SECRET`
   - `APP_BASE_URL`
   - **PostgreSQL Database:**
     - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
     - Railway otomatik olarak PostgreSQL servisi oluşturabilir
   - Email ayarları (opsiyonel)

6. Deploy otomatik başlar

**Not:** Railway ücretsiz kredi verir, sonra ücretli plana geçmeniz gerekebilir.

---

### Seçenek 3: Vercel

**Dikkat:** Vercel serverless fonksiyonlar için tasarlanmıştır. SQLite ve dosya yükleme özellikleri için uygun olmayabilir. PostgreSQL gibi bir veritabanına geçiş gerekebilir.

1. [Vercel.com](https://vercel.com) hesabı oluşturun
2. "New Project" → GitHub repo'nuzu seçin
3. Framework Preset: "Other"
4. Build Command: `npm install`
5. Output Directory: `.`
6. Environment Variables ekleyin
7. Deploy edin

---

### Seçenek 4: DigitalOcean App Platform

1. [DigitalOcean](https://www.digitalocean.com) hesabı oluşturun
2. "Apps" → "Create App" → GitHub repo seçin
3. Otomatik algılama yapılır
4. Environment Variables ekleyin
5. Deploy edin

**Not:** Ücretli servis, ancak güvenilir ve hızlı.

---

### Seçenek 5: Heroku (Alternatif)

1. [Heroku](https://www.heroku.com) hesabı oluşturun
2. Heroku CLI kurun
3. Terminal'de:
   ```bash
   heroku login
   heroku create your-app-name
   git push heroku main
   ```
4. Environment Variables ekleyin:
   ```bash
   heroku config:set SESSION_SECRET=your-secret
   heroku config:set APP_BASE_URL=https://your-app.herokuapp.com
   ```

---

## 🔐 Güvenlik Notları

1. **SESSION_SECRET:** Üretim ortamında mutlaka güçlü bir rastgele string kullanın:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Database:** Proje artık PostgreSQL kullanıyor. Üretimde mutlaka güvenli bir PostgreSQL veritabanı kullanın:
   - Render: PostgreSQL servisi ekleyin
   - Railway: PostgreSQL servisi otomatik eklenebilir
   - Heroku: Heroku Postgres addon'u ekleyin
   - DigitalOcean: Managed PostgreSQL database oluşturun

3. **File Uploads:** Yüklenen dosyalar `backend/uploads/` klasöründe saklanır. Büyük dosyalar için S3 veya benzeri bir servis kullanın.

---

## 📧 Email Yapılandırması (Opsiyonel)

Görev atama bildirimleri için email ayarları:

### Gmail Kullanımı:
1. Google Account → Security → 2-Step Verification aktif edin
2. App Passwords oluşturun
3. `.env` dosyasında:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   ```

### Diğer SMTP Servisleri:
- SendGrid
- Mailgun
- AWS SES

---

## 🗄️ Veritabanı Yedekleme

PostgreSQL veritabanınızı yedeklemek için:

```bash
# Yerel olarak
pg_dump -h localhost -U postgres -d task_manager > backup.sql

# Production'da (Render/Railway CLI kullanarak)
# Platform'un kendi backup özelliklerini kullanın
```

---

## 🐛 Sorun Giderme

### Port Hatası
- Platform otomatik olarak `PORT` environment variable'ını ayarlar
- Kodunuzda `process.env.PORT || 3000` kullanıldığından emin olun

### Database Hatası
- PostgreSQL bağlantı bilgilerinin doğru olduğundan emin olun
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` environment variables'larını kontrol edin
- SSL bağlantısı gerekiyorsa `DB_SSL=true` ayarlayın
- Veritabanı tablolarının oluşturulduğundan emin olun (ilk çalıştırmada otomatik oluşturulur)

### Static Files
- CSS, JS ve resimler `backend/public/` klasöründe
- Upload edilen dosyalar `backend/uploads/` klasöründe

---

## 📝 Öneriler

1. **Production Database:** ✅ PostgreSQL kullanılıyor
2. **File Storage:** AWS S3 veya Cloudinary kullanın
3. **Monitoring:** Sentry veya benzeri bir servis ekleyin
4. **Backup:** Düzenli veritabanı yedekleri alın (platform'un otomatik backup özelliklerini kullanın)

---

## ✅ Deployment Kontrol Listesi

- [ ] Git repository oluşturuldu ve push edildi
- [ ] `.env` dosyası oluşturuldu (local'de)
- [ ] PostgreSQL veritabanı oluşturuldu (platform'da)
- [ ] Environment variables platform'da ayarlandı (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD)
- [ ] `SESSION_SECRET` güçlü bir değerle değiştirildi
- [ ] `APP_BASE_URL` doğru URL ile ayarlandı
- [ ] Email ayarları yapılandırıldı (opsiyonel)
- [ ] Uygulama başarıyla deploy edildi
- [ ] Veritabanı tabloları oluşturuldu (ilk çalıştırmada otomatik)
- [ ] Test kullanıcısı ile giriş yapıldı
- [ ] Görev oluşturma/test edildi

---

## 🆘 Yardım

Sorun yaşarsanız:
1. Platform'un log'larını kontrol edin
2. Environment variables'ların doğru olduğundan emin olun
3. `NODE_ENV=production` ayarlandığından emin olun

