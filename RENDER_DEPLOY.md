# Render'e Deploy Rehberi - Adım Adım

Bu rehber, Task Manager uygulamanızı Render.com'a deploy etmeniz için detaylı adımları içerir.

## 📋 Ön Hazırlık

### 1. Git Repository Oluşturun

Eğer henüz yapmadıysanız:

```bash
# Proje klasöründe
git init
git add .
git commit -m "Initial commit - Ready for Render deployment"

# GitHub'da yeni bir repository oluşturun, sonra:
git remote add origin https://github.com/your-username/your-repo-name.git
git branch -M main
git push -u origin main
```

**Önemli:** `.env` dosyasını commit etmeyin! (zaten .gitignore'da)

---

## 🚀 Render'e Deploy Adımları

### Adım 1: Render Hesabı Oluşturun

1. [Render.com](https://render.com) adresine gidin
2. **"Get Started for Free"** tıklayın
3. GitHub hesabınızla giriş yapın

---

### Adım 2: PostgreSQL Database Oluşturun

1. Render dashboard'da **"New +"** → **"PostgreSQL"** seçin
2. Ayarlar:
   - **Name:** `task-manager-db`
   - **Database:** `task_manager` (veya istediğiniz isim)
   - **User:** Render otomatik oluşturur
   - **Region:** Size en yakın bölgeyi seçin
   - **Plan:** Free (veya ücretli)
3. **"Create Database"** tıklayın
4. Database oluşturulduktan sonra:
   - **"Connections"** sekmesine gidin
   - **"Internal Database URL"** değerini kopyalayın (sonra kullanacağız)

---

### Adım 3: Web Service Oluşturun

1. Render dashboard'da **"New +"** → **"Web Service"** seçin
2. GitHub repository'nizi seçin
3. Ayarlar:

   **Basic:**
   - **Name:** `task-manager` (veya istediğiniz isim)
   - **Region:** Database ile aynı bölgeyi seçin
   - **Branch:** `main` (veya `master`)
   - **Root Directory:** (boş bırakın)
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (veya ücretli)

   **Advanced:**
   - `render.yaml` dosyanız varsa otomatik algılanır
   - Yoksa yukarıdaki ayarları manuel girin

---

### Adım 4: Environment Variables Ekleyin

Web Service oluşturulduktan sonra **"Environment"** sekmesine gidin ve şu değişkenleri ekleyin:

#### Zorunlu Değişkenler:

```env
NODE_ENV=production
PORT=10000
SESSION_SECRET=<güçlü-rastgele-string-buraya>
APP_BASE_URL=https://your-app-name.onrender.com
```

**SESSION_SECRET oluşturmak için:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### PostgreSQL Database Değişkenleri:

PostgreSQL servisinizin **"Connections"** sekmesinden değerleri alın:

```env
DB_HOST=<internal-database-host>
DB_PORT=5432
DB_NAME=<database-name>
DB_USER=<database-user>
DB_PASSWORD=<database-password>
DB_SSL=
































```

**Veya daha kolay:** PostgreSQL servisinin **"Internal Database URL"** değerini kullanabilirsiniz. Render otomatik olarak parse eder.

#### Email Değişkenleri (Opsiyonel):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM=no-reply@yourdomain.com
```

---

### Adım 5: Deploy'i Başlatın

1. **"Create Web Service"** tıklayın
2. Deploy otomatik başlar
3. **"Logs"** sekmesinden ilerlemeyi izleyin

---

### Adım 6: İlk Deploy Sonrası

Deploy tamamlandıktan sonra:

1. **"Events"** sekmesinden deploy durumunu kontrol edin
2. **"Logs"** sekmesinden hataları kontrol edin
3. Uygulama URL'ine gidin: `https://your-app-name.onrender.com`

**İlk çalıştırmada:**
- Veritabanı tabloları otomatik oluşturulacak
- Varsayılan admin kullanıcısı eklenecek
- Session tablosu oluşturulacak

---

## 🔧 Önemli Notlar

### Session Tablosu

İlk deploy'da session tablosu otomatik oluşturulmayabilir. Manuel oluşturmanız gerekebilir:

1. PostgreSQL servisinizin **"Connect"** butonuna tıklayın
2. **"psql"** seçeneğini kullanın
3. Şu komutu çalıştırın:

```sql
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
```

---

### Free Plan Limitleri

- **Uyku Modu:** 15 dakika kullanılmadığında uygulama uyku moduna geçer
- **İlk İstek:** Uyku modundan uyanmak 30-60 saniye sürebilir
- **Disk:** 512 MB limit
- **RAM:** 512 MB limit

---

### Production İpuçları

1. **Custom Domain:** Ücretsiz plan custom domain destekler
2. **Auto-Deploy:** Her push'ta otomatik deploy edilir
3. **Health Checks:** Render otomatik health check yapar
4. **Logs:** 7 günlük log tutulur (free plan)

---

## 🐛 Sorun Giderme

### Deploy Başarısız

**Log'ları kontrol edin:**
- Build hatası mı?
- Environment variables eksik mi?
- Database bağlantı hatası mı?

### Database Bağlantı Hatası

- `DB_HOST`, `DB_USER`, `DB_PASSWORD` değerlerini kontrol edin
- PostgreSQL servisinin çalıştığından emin olun
- `DB_SSL=true` olduğundan emin olun

### Session Tablosu Hatası

- Yukarıdaki SQL komutunu çalıştırın
- Veya uygulama kodunu güncelleyip session tablosunu otomatik oluşturun

### Port Hatası

- Render otomatik olarak `PORT` environment variable'ını ayarlar
- Kodunuzda `process.env.PORT || 3000` kullanıldığından emin olun

---

## ✅ Kontrol Listesi

- [ ] Git repository oluşturuldu ve push edildi
- [ ] Render hesabı oluşturuldu
- [ ] PostgreSQL database oluşturuldu
- [ ] Web Service oluşturuldu
- [ ] Environment variables eklendi
- [ ] Deploy başarılı oldu
- [ ] Session tablosu oluşturuldu (gerekirse)
- [ ] Uygulama çalışıyor
- [ ] Admin kullanıcısı ile giriş yapıldı
- [ ] Test görevi oluşturuldu

---

## 📝 Hızlı Başlangıç Özeti

1. **GitHub'a push edin**
2. **Render'da PostgreSQL oluşturun**
3. **Render'da Web Service oluşturun**
4. **Environment variables ekleyin**
5. **Deploy edin**
6. **Session tablosunu oluşturun** (gerekirse)
7. **Test edin**

---

## 🆘 Yardım

Sorun yaşarsanız:
- Render dashboard'daki **"Logs"** sekmesini kontrol edin
- **"Events"** sekmesinden deploy geçmişini görün
- Render support'a başvurun




