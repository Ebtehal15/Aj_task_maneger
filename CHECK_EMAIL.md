# Email Gönderme Sorun Giderme

## 🔍 Kontrol Listesi

### 1. .env Dosyası Kontrolü

`.env` dosyasında email ayarlarının olduğundan emin olun:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM=no-reply@yourdomain.com
```

**Kontrol:**
- Tüm değerler doldurulmuş mu?
- `SMTP_PASS` Gmail App Password mu? (normal şifre değil!)

---

### 2. Kullanıcı Email Adresi Kontrolü

Kullanıcıların email adreslerinin kaydedildiğini kontrol edin:

**PostgreSQL'de:**
```sql
SELECT id, username, email FROM users;
```

**Veya Admin panelinden:**
- `/admin/users` sayfasına gidin
- Kullanıcıların email adreslerini kontrol edin

---

### 3. Console Log Kontrolü

Uygulamayı çalıştırırken console'da şu mesajları kontrol edin:

**Email yapılandırılmamışsa:**
```
Email not configured (SMTP_HOST / SMTP_PORT missing). Task assignment emails will be skipped.
```

**Email gönderildiğinde:**
```
Notification email sent to: user@example.com
```

**Email hatası varsa:**
```
Error sending notification email [hata detayları]
```

---

### 4. Gmail App Password Oluşturma

Eğer Gmail kullanıyorsanız:

1. Google Account → **Security** (Güvenlik)
2. **2-Step Verification** aktif edin
3. **App passwords** → **Select app** → **Mail**
4. **Select device** → **Other (Custom name)** → "Task Manager" yazın
5. **Generate** → Oluşturulan 16 haneli şifreyi kopyalayın
6. `.env` dosyasında `SMTP_PASS` olarak kullanın

**Önemli:** Normal Gmail şifreniz çalışmaz, App Password gerekli!

---

### 5. Test Email Gönderme

Test için basit bir script:

```javascript
// test-email.js
require('dotenv').config();
const { sendNotificationEmail } = require('./backend/services/email');

sendNotificationEmail(
  'test@example.com',  // Test email adresiniz
  'Test bildirimi',
  null
);
```

Çalıştırın:
```bash
node test-email.js
```

---

## 🐛 Yaygın Sorunlar

### Sorun 1: "Email not configured" uyarısı

**Çözüm:**
- `.env` dosyasını kontrol edin
- `SMTP_HOST` ve `SMTP_PORT` değerlerini kontrol edin
- Uygulamayı yeniden başlatın

### Sorun 2: "Authentication failed" hatası

**Çözüm:**
- Gmail kullanıyorsanız App Password kullanın
- `SMTP_USER` ve `SMTP_PASS` değerlerini kontrol edin
- 2-Step Verification aktif mi kontrol edin

### Sorun 3: Email gönderiliyor ama gelmiyor

**Çözüm:**
- Spam klasörünü kontrol edin
- `MAIL_FROM` adresini kontrol edin
- Email servis sağlayıcınızın limitlerini kontrol edin

### Sorun 4: Kullanıcının email'i yok

**Çözüm:**
- Admin panelinden kullanıcıya email ekleyin
- `/admin/users` → Kullanıcıyı düzenle → Email ekle

---

## ✅ Hızlı Test

1. **Email ayarlarını kontrol edin:**
   ```bash
   # .env dosyasını açın ve kontrol edin
   ```

2. **Kullanıcı email'ini kontrol edin:**
   ```sql
   SELECT email FROM users WHERE id = [kullanıcı_id];
   ```

3. **Console log'larını izleyin:**
   ```bash
   npm start
   # Bildirim oluşturun ve console'u izleyin
   ```

4. **Test email gönderin:**
   - Yeni bir görev atayın
   - Console'da "Notification email sent" mesajını arayın







