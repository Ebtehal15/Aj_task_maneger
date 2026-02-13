# Task Manager

Çok kullanıcılı görev yönetim uygulaması. Admin ve kullanıcı rolleri, Arapça/İngilizce çift dil desteği ile.

## 🚀 Hızlı Başlangıç

### Yerel Kurulum

```bash
# Bağımlılıkları yükle
npm install

# Uygulamayı başlat
npm start

# Geliştirme modu (nodemon ile)
npm run dev
```

Uygulama `http://localhost:3000` adresinde çalışacaktır.

### Varsayılan Giriş Bilgileri

- **Admin:** 
  - Kullanıcı adı: `admin`
  - Şifre: `admin123`

## 📦 Özellikler

- ✅ Çok kullanıcılı sistem (Admin ve User rolleri)
- ✅ Görev oluşturma, düzenleme ve silme
- ✅ Dosya yükleme desteği (dosya yolu referansları ile optimize edilmiş)
- ✅ Bildirim sistemi (BOOLEAN ve TIMESTAMP ile optimize edilmiş)
- ✅ Çift dil desteği (Arapça/İngilizce) - UTF-8 encoding
- ✅ RTL (Right-to-Left) dil desteği
- ✅ Email bildirimleri (opsiyonel)
- ✅ PostgreSQL veritabanı (production-ready)

## 🌐 Online'a Taşıma

Projeyi online'a taşımak için detaylı rehber: **[DEPLOYMENT.md](./DEPLOYMENT.md)**

PostgreSQL veritabanı kurulumu için: **[DATABASE_SETUP.md](./DATABASE_SETUP.md)**

Aynı sunucuda birden fazla uygulama çalıştırma: **[MULTI_APP_SETUP.md](./MULTI_APP_SETUP.md)**

Teknik detaylar ve en iyi uygulamalar: **[TECHNICAL_NOTES.md](./TECHNICAL_NOTES.md)**

### Hızlı Deployment Seçenekleri:

1. **Render** (Önerilen - Ücretsiz plan)
2. **Railway** (Kolay kurulum)
3. **Vercel** (Serverless - PostgreSQL için uygun)
4. **DigitalOcean** (Ücretli, güvenilir)
5. **Heroku** (Alternatif)

## 🔧 Yapılandırma

### Environment Variables

`.env` dosyası oluşturun (`.env.example` dosyasını referans alın):

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=your-secret-key
APP_BASE_URL=http://localhost:3000

# PostgreSQL Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=task_manager
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false

# Email (Opsiyonel)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM=no-reply@yourdomain.com
```

## 📁 Proje Yapısı

```
task_maneger/
├── backend/
│   ├── public/        # Static dosyalar (CSS, images)
│   ├── routes/        # Route handlers
│   ├── services/      # Business logic (db.js, auth, notifications)
│   ├── uploads/       # Yüklenen dosyalar
│   ├── views/         # EJS templates
│   └── server.js      # Ana server dosyası
├── package.json
├── README.md
├── DEPLOYMENT.md      # Deployment rehberi
└── DATABASE_SETUP.md  # PostgreSQL kurulum rehberi
```

## 🛠️ Teknolojiler

- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL
- **Template Engine:** EJS
- **Session:** express-session (PostgreSQL store)
- **File Upload:** Multer
- **Email:** Nodemailer
- **Authentication:** bcryptjs

## 📝 Lisans

ISC

## 👤 Yazar

Task Manager - Multi-user task management system

