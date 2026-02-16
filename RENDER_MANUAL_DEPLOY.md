# 🚀 Render'a Manuel Deploy Rehberi (Adım Adım)

Bu rehber, Task Manager uygulamanızı Render'a **ayrı ayrı** (database ve web service) deploy etmeniz için adım adım talimatlar içerir.

---

## 📋 Adım 1: PostgreSQL Database Oluşturun

### 1.1. Render Dashboard'a Gidin

1. [Render.com](https://render.com) → Giriş yapın
2. Sol menüden **"Services"** tıklayın

### 1.2. PostgreSQL Database Oluşturun

1. **"New +"** butonuna tıklayın
2. **"PostgreSQL"** seçin

### 1.3. Database Ayarları

Aşağıdaki ayarları yapın:

- **Name:** `task-manager-db` (veya istediğiniz isim)
- **Database:** `task_manager` (veya istediğiniz isim)
- **User:** Render otomatik oluşturur (veya özel isim)
- **Region:** Size en yakın bölgeyi seçin (örn: `Oregon (US West)`)
- **PostgreSQL Version:** En son sürüm (varsayılan)
- **Plan:** 
  - **Free** (ücretsiz, 90 gün sonra uyku moduna geçer)
  - **Starter** ($7/ay - uyku modu yok)

### 1.4. Database'i Oluşturun

1. **"Create Database"** butonuna tıklayın
2. Database oluşturulmasını bekleyin (1-2 dakika)

### 1.5. Database Bağlantı Bilgilerini Alın

Database oluşturulduktan sonra:

1. Database sayfasına gidin
2. **"Connections"** sekmesine tıklayın
3. **"Internal Database URL"** değerini kopyalayın
   - Format: `postgresql://user:password@host:port/database`
   - Örnek: `postgresql://task_manager_user:abc123@dpg-xxxxx-a:5432/task_manager`

**⚠️ ÖNEMLİ:** Bu URL'yi bir yere kaydedin, sonraki adımda kullanacağız!

---

## 📋 Adım 2: Web Service Oluşturun

### 2.1. Web Service Oluşturma

1. Render dashboard'da **"New +"** butonuna tıklayın
2. **"Web Service"** seçin

### 2.2. GitHub Repository Bağlama

1. **"Connect account"** veya **"Connect repository"** tıklayın
2. GitHub hesabınızı bağlayın (eğer bağlı değilse)
3. Repository'nizi seçin: `Ebtehal15/Aj_task_maneger`

### 2.3. Web Service Ayarları

Aşağıdaki ayarları yapın:

**Basic Settings:**
- **Name:** `task-manager` (veya istediğiniz isim)
- **Region:** Database ile **aynı bölgeyi** seçin (önemli!)
- **Branch:** `main` (veya `master`)
- **Root Directory:** (boş bırakın)
- **Environment:** `Node`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Plan:** 
  - **Free** (ücretsiz, 15 dakika kullanılmadığında uyku moduna geçer)
  - **Starter** ($7/ay - uyku modu yok)

**Advanced Settings:**
- `render.yaml` dosyası otomatik algılanacak (isteğe bağlı)

### 2.4. Environment Variables Ekleyin

**"Environment"** sekmesine gidin ve şu değişkenleri ekleyin:

#### Zorunlu Değişkenler:

1. **DATABASE_URL**
   ```
   Key: DATABASE_URL
   Value: [Adım 1.5'te kopyaladığınız Internal Database URL'in TAMAMI]
   ```
   Örnek:
   ```
   postgresql://task_manager_user:abc123@dpg-xxxxx-a:5432/task_manager
   ```

2. **NODE_ENV**
   ```
   Key: NODE_ENV
   Value: production
   ```

3. **DB_SSL**
   ```
   Key: DB_SSL
   Value: true
   ```

4. **SESSION_SECRET**
   ```
   Key: SESSION_SECRET
   Value: [Güçlü rastgele string]
   ```
   
   **SESSION_SECRET oluşturmak için:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Çıktıyı kopyalayıp `SESSION_SECRET` değeri olarak yapıştırın.

5. **APP_BASE_URL**
   ```
   Key: APP_BASE_URL
   Value: https://task-manager-xxxx.onrender.com
   ```
   **Not:** Deploy tamamlandıktan sonra gerçek URL'yi alacaksınız, şimdilik placeholder kullanabilirsiniz. Deploy sonrası güncelleyin.

#### Opsiyonel Değişkenler (Email için):

6. **SMTP_HOST** (Email göndermek için)
   ```
   Key: SMTP_HOST
   Value: smtp.gmail.com
   ```

7. **SMTP_PORT**
   ```
   Key: SMTP_PORT
   Value: 587
   ```

8. **SMTP_USER**
   ```
   Key: SMTP_USER
   Value: your-email@gmail.com
   ```

9. **SMTP_PASS**
   ```
   Key: SMTP_PASS
   Value: your-app-password
   ```
   **Not:** Gmail için App Password oluşturmanız gerekir.

10. **MAIL_FROM**
    ```
    Key: MAIL_FROM
    Value: no-reply@yourdomain.com
    ```

### 2.5. Web Service'i Oluşturun

1. Tüm ayarları kontrol edin
2. **"Create Web Service"** butonuna tıklayın
3. Deploy otomatik başlar

---

## 📋 Adım 3: Deploy'i İzleyin

### 3.1. Log'ları Kontrol Edin

1. Web Service sayfasında **"Logs"** sekmesine gidin
2. Deploy ilerlemesini izleyin
3. İlk deploy 5-10 dakika sürebilir

### 3.2. Başarılı Deploy İşaretleri

Log'larda şu mesajları görmelisiniz:

```
✅ Database pool initialized
✅ Database connection test successful
✅ Task manager app running on http://0.0.0.0:PORT
```

### 3.3. Hata Kontrolü

Eğer hata görürseniz:

- **Build hatası:** `package.json` ve dependencies'i kontrol edin
- **Database bağlantı hatası:** `DATABASE_URL` değerini kontrol edin
- **Port hatası:** Render otomatik ayarlar, sorun olmamalı

---

## 📋 Adım 4: İlk Kullanım

### 4.1. Uygulama URL'ini Alın

1. Web Service sayfasında **üst kısımda** uygulama URL'ini görün
2. Format: `https://task-manager-xxxx.onrender.com`
3. Bu URL'yi kopyalayın

### 4.2. APP_BASE_URL'i Güncelleyin

1. Web Service → **"Environment"** sekmesine gidin
2. `APP_BASE_URL` değerini gerçek URL ile güncelleyin
3. **"Save Changes"** tıklayın
4. Render otomatik olarak yeniden deploy eder

### 4.3. Uygulamayı Test Edin

1. Uygulama URL'ine gidin
2. Varsayılan admin bilgileri:
   - **Username:** `admin`
   - **Password:** `admin123`
3. Giriş yapın
4. Test görevi oluşturun

### 4.4. Admin Şifresini Değiştirin

**ÖNEMLİ:** İlk girişten sonra admin şifresini mutlaka değiştirin!

---

## ✅ Kontrol Listesi

- [ ] PostgreSQL database oluşturuldu
- [ ] Database'in "Connections" sekmesinden Internal Database URL kopyalandı
- [ ] Web Service oluşturuldu
- [ ] Environment variables eklendi:
  - [ ] `DATABASE_URL` (Internal Database URL)
  - [ ] `NODE_ENV=production`
  - [ ] `DB_SSL=true`
  - [ ] `SESSION_SECRET` (güçlü değer)
  - [ ] `APP_BASE_URL` (deploy sonrası güncellenecek)
- [ ] Deploy başarılı oldu
- [ ] Log'larda hata yok
- [ ] Uygulama URL'ine erişilebiliyor
- [ ] Admin kullanıcısı ile giriş yapıldı
- [ ] `APP_BASE_URL` gerçek URL ile güncellendi
- [ ] Test görevi oluşturuldu

---

## 🐛 Sorun Giderme

### Database Bağlantı Hatası

**Hata:** `ECONNREFUSED` veya `Connection refused`

**Çözüm:**
1. `DATABASE_URL` değerinin doğru olduğundan emin olun
2. Database ve Web Service'in **aynı region**'da olduğundan emin olun
3. `DB_SSL=true` olduğundan emin olun
4. Internal Database URL kullandığınızdan emin olun

### Session Tablosu Hatası

**Hata:** `relation "session" does not exist`

**Çözüm:**
Tablolar otomatik oluşturulmalı, ancak bazen manuel oluşturmanız gerekebilir:

1. PostgreSQL database'inizin **"Connect"** butonuna tıklayın
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

### Uyku Modu (Free Plan)

Free plan kullanıyorsanız:
- 15 dakika kullanılmadığında uygulama uyku moduna geçer
- İlk istek 30-60 saniye sürebilir (uyanma süresi)
- Bu normal bir durumdur

---

## 🎉 Başarılı Deploy Sonrası

Uygulamanız başarıyla deploy edildikten sonra:

1. ✅ Admin şifresini değiştirin
2. ✅ İlk kullanıcıları oluşturun
3. ✅ Test görevleri oluşturun
4. ✅ Email ayarlarını yapılandırın (opsiyonel)
5. ✅ Custom domain ekleyin (opsiyonel)

**Tebrikler! Uygulamanız artık canlıda! 🚀**

