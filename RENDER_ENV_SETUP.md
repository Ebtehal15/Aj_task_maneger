# Render Environment Variables Kurulumu

## 🔧 Render'da Environment Variables Ayarlama

### Yöntem 1: Internal Database URL Kullanma (Önerilen - En Kolay)

Render'da PostgreSQL database'inizin **"Connections"** sekmesinden:

1. **"Internal Database URL"** değerini kopyalayın
2. Web Service'in **"Environment"** sekmesine gidin
3. Şu değişkeni ekleyin:

```
Key: DATABASE_URL
Value: postgresql://user:password@host:port/database
```

**Örnek:**
```
postgresql://task_manager_bjvo_user:qFN3XYrGJ9hJAnJOPSndkEWI9BVZbDhz@dpg-d67ip5248b3s73cbrtvg-a:5432/task_manager_bjvo
```

**Avantaj:** Tek bir değişken, otomatik parse edilir.

---

### Yöntem 2: Ayrı Ayrı Environment Variables

Eğer `DATABASE_URL` kullanmak istemiyorsanız, ayrı ayrı ekleyin:

```
DB_HOST=dpg-d67ip5248b3s73cbrtvg-a
DB_PORT=5432
DB_NAME=task_manager_bjvo
DB_USER=task_manager_bjvo_user
DB_PASSWORD=qFN3XYrGJ9hJAnJOPSndkEWI9BVZbDhz
DB_SSL=true
```

---

## 📋 Tam Environment Variables Listesi

Web Service'in **"Environment"** sekmesine şu değişkenleri ekleyin:

### Zorunlu:

```env
NODE_ENV=production
PORT=10000
SESSION_SECRET=<rastgele-32-karakter-string>
APP_BASE_URL=https://your-app-name.onrender.com
```

### Database (Yöntem 1 - Önerilen):

```env
DATABASE_URL=postgresql://user:password@host:port/database
DB_SSL=true
```

### Database (Yöntem 2 - Alternatif):

```env
DB_HOST=<host>
DB_PORT=5432
DB_NAME=<database-name>
DB_USER=<user>
DB_PASSWORD=<password>
DB_SSL=true
```

### Email (Opsiyonel):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM=no-reply@yourdomain.com
```

---

## 🔑 SESSION_SECRET Oluşturma

PowerShell veya Terminal'de:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Çıktıyı kopyalayıp `SESSION_SECRET` olarak ekleyin.

---

## ✅ Kontrol Listesi

- [ ] PostgreSQL database oluşturuldu ve hazır
- [ ] Internal Database URL kopyalandı
- [ ] Web Service oluşturuldu
- [ ] `DATABASE_URL` environment variable eklendi
- [ ] `SESSION_SECRET` eklendi
- [ ] `APP_BASE_URL` eklendi (deploy sonrası URL)
- [ ] Diğer environment variables eklendi
- [ ] Deploy başarılı oldu
- [ ] Uygulama çalışıyor

---

## 🐛 Sorun Giderme

### "ENOTFOUND" Hatası

- `DATABASE_URL` kullanıyorsanız, tam URL'i kopyaladığınızdan emin olun
- Ayrı değişkenler kullanıyorsanız, `DB_HOST` değerini kontrol edin
- Database'in hazır olduğundan emin olun

### "Connection refused" Hatası

- Database'in "Available" durumunda olduğunu kontrol edin
- `DB_SSL=true` olduğundan emin olun
- Internal Database URL kullanıyorsanız, "Internal" olanı kullanın (External değil)

### "Authentication failed" Hatası

- `DB_USER` ve `DB_PASSWORD` değerlerini kontrol edin
- Database'in "Connections" sekmesinden doğru değerleri kopyaladığınızdan emin olun


