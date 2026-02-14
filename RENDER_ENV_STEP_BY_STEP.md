# Render Environment Variables - Adım Adım Rehber

## 🔴 Sorun: Environment Variables Render'da Ayarlanmamış

Log'larda görünen hata: `ECONNREFUSED 127.0.0.1:5432`

Bu, uygulamanın hala localhost'a bağlanmaya çalıştığı anlamına gelir. **Environment variables Render'da ayarlanmamış!**

---

## ✅ Çözüm: Environment Variables Ekleme

### Adım 1: Render Dashboard'a Gidin

1. [render.com](https://render.com) → Giriş yapın
2. Dashboard'da **"Services"** tıklayın (sol menü)

### Adım 2: Web Service'inizi Bulun

1. Listeden **`task-manager`** (veya oluşturduğunuz isim) Web Service'ine tıklayın

### Adım 3: Environment Sekmesine Gidin

1. Web Service sayfasında **üstteki sekmelerden "Environment"** tıklayın
2. Veya sol menüden **"Environment"** seçeneğine tıklayın

### Adım 4: PostgreSQL Database URL'ini Alın

**Ayrı bir pencerede:**

1. Render dashboard → **"Services"** → PostgreSQL database'inize tıklayın
2. **"Connections"** sekmesine tıklayın
3. **"Internal Database URL"** değerini kopyalayın
   - Format: `postgresql://user:password@host:port/database`
   - Örnek: `postgresql://task_manager_user:abc123@dpg-xxxxx-a:5432/task_manager`

**Eğer Internal URL yoksa veya farklı project'te ise:**
- **"External Database URL"** kullanın
- Format aynı: `postgresql://user:password@host:port/database`

### Adım 5: Environment Variables Ekleyin

Web Service'in **"Environment"** sekmesine dönün ve şu değişkenleri ekleyin:

#### 5.1. DATABASE_URL (Zorunlu)

1. **"Add Environment Variable"** veya **"+"** butonuna tıklayın
2. **Key:** `DATABASE_URL`
3. **Value:** Adım 4'te kopyaladığınız Internal/External Database URL'in tamamı
4. **"Save"** tıklayın

#### 5.2. DB_SSL (Zorunlu - Render için)

1. **"Add Environment Variable"** tıklayın
2. **Key:** `DB_SSL`
3. **Value:** `true`
4. **"Save"** tıklayın

#### 5.3. NODE_ENV (Zorunlu)

1. **"Add Environment Variable"** tıklayın
2. **Key:** `NODE_ENV`
3. **Value:** `production`
4. **"Save"** tıklayın

#### 5.4. PORT (Zorunlu)

1. **"Add Environment Variable"** tıklayın
2. **Key:** `PORT`
3. **Value:** `10000`
4. **"Save"** tıklayın

#### 5.5. SESSION_SECRET (Zorunlu)

1. **"Add Environment Variable"** tıklayın
2. **Key:** `SESSION_SECRET`
3. **Value:** Rastgele 32+ karakter string (local `.env` dosyanızdan kopyalayabilirsiniz)
   - Örnek: `23677ed9072250460a5c3aa1a8b87547ce62c9edd0fe208f5d9c66498960faac`
4. **"Save"** tıklayın

#### 5.6. APP_BASE_URL (Zorunlu)

1. **"Add Environment Variable"** tıklayın
2. **Key:** `APP_BASE_URL`
3. **Value:** Web Service'inizin URL'i
   - Format: `https://your-app-name.onrender.com`
   - Web Service'in **"Settings"** sekmesinden URL'inizi görebilirsiniz
4. **"Save"** tıklayın

### Adım 6: Tüm Değişkenleri Kaydedin

1. Tüm değişkenleri ekledikten sonra sayfanın altında **"Save Changes"** butonuna tıklayın
2. Render otomatik olarak yeni bir deploy başlatacak

### Adım 7: Deploy'u İzleyin

1. **"Logs"** sekmesine tıklayın
2. Deploy'un başlamasını bekleyin
3. Log'larda şunu arayın:

**✅ Başarılı:**
```
🔍 Database Config Check:
  DATABASE_URL: ✅ Set
  ...
✅ Using DATABASE_URL connection string
Task manager app running on http://localhost:10000
```

**❌ Hata devam ediyorsa:**
```
🔍 Database Config Check:
  DATABASE_URL: ❌ Not set
  DB_HOST: ❌ Not set (using default: localhost)
  ...
⚠️  Using individual DB environment variables (or defaults)
```

Eğer hata devam ediyorsa, environment variables'lar kaydedilmemiş demektir.

---

## 🔍 Kontrol Listesi

Deploy öncesi kontrol edin:

- [ ] PostgreSQL database oluşturuldu ve "Available" durumunda
- [ ] Web Service oluşturuldu
- [ ] Environment sekmesine gidildi
- [ ] `DATABASE_URL` eklendi (Internal veya External URL)
- [ ] `DB_SSL=true` eklendi
- [ ] `NODE_ENV=production` eklendi
- [ ] `PORT=10000` eklendi
- [ ] `SESSION_SECRET` eklendi
- [ ] `APP_BASE_URL` eklendi (doğru URL ile)
- [ ] "Save Changes" tıklandı
- [ ] Deploy başladı

---

## ⚠️ Yaygın Hatalar

### Hata 1: "Save Changes" Tıklanmadı

**Sorun:** Değişkenler eklendi ama kaydedilmedi

**Çözüm:** Sayfanın altındaki **"Save Changes"** butonuna mutlaka tıklayın

### Hata 2: Yanlış URL Formatı

**Sorun:** DATABASE_URL'de port eksik veya yanlış format

**Doğru format:**
```
postgresql://user:password@host:port/database
```

**Yanlış formatlar:**
- ❌ `postgresql://user:password@host/database` (port eksik)
- ❌ `postgres://...` (eski format, çalışabilir ama önerilmez)
- ❌ Sadece host adresi

### Hata 3: Internal vs External URL

**Sorun:** Farklı project'lerde ise Internal URL çalışmaz

**Çözüm:** External Database URL kullanın veya servisleri aynı project'e taşıyın

### Hata 4: Deploy Otomatik Başlamadı

**Sorun:** Environment variables değişti ama deploy başlamadı

**Çözüm:** **"Manual Deploy"** → **"Deploy latest commit"** tıklayın

---

## 🚀 Hızlı Test

Deploy sonrası log'larda şunu görmelisiniz:

```
🔍 Database Config Check:
  DATABASE_URL: ✅ Set
  DB_HOST: ❌ Not set (using default: localhost)
  ...
✅ Using DATABASE_URL connection string
Task manager app running on http://localhost:10000
Default admin created: username=admin, password=admin123
```

**Hata mesajı olmamalı!**

---

## 📸 Görsel Rehber İçin

Eğer adımları takip ederken sorun yaşıyorsanız:

1. **Environment** sekmesinin ekran görüntüsünü paylaşın
2. **PostgreSQL Connections** sekmesinin ekran görüntüsünü paylaşın
3. **Log** çıktısının ekran görüntüsünü paylaşın

Böylece daha spesifik yardım edebilirim!

