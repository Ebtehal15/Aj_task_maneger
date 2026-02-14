# Render Project Sorunu Çözümü

## 🔴 Sorun: Aynı Project İçinde Değil

Eğer PostgreSQL database ve Web Service **farklı project'lerde** ise, Internal Database URL çalışmayabilir.

## ✅ Çözüm 1: Aynı Project'e Taşıma (Önerilen)

### Adım 1: Project Kontrolü

1. Render dashboard'da **sol menüden "Projects"** tıklayın
2. PostgreSQL database'inizin hangi project'te olduğunu kontrol edin
3. Web Service'inizin hangi project'te olduğunu kontrol edin

**Eğer farklı project'lerde ise:**

### Adım 2: Web Service'i Database'in Project'ine Taşıma

1. Web Service'inize gidin
2. **"Settings"** sekmesine tıklayın
3. **"Project"** bölümünü bulun
4. **"Change Project"** veya dropdown'dan database'inizin olduğu project'i seçin
5. **"Save Changes"** tıklayın

**VEYA:**

### Adım 3: Database'i Web Service'in Project'ine Taşıma

1. PostgreSQL database'inize gidin
2. **"Settings"** sekmesine tıklayın
3. **"Project"** bölümünü bulun
4. **"Change Project"** veya dropdown'dan Web Service'inizin olduğu project'i seçin
5. **"Save Changes"** tıklayın

---

## ✅ Çözüm 2: External Database URL Kullanma

Eğer servisleri aynı project'e taşıyamıyorsanız, **External Database URL** kullanabilirsiniz:

### Adım 1: External Database URL Alın

1. PostgreSQL database'inizin **"Connections"** sekmesine gidin
2. **"External Database URL"** değerini kopyalayın
3. **Önemli:** Bu URL genellikle `dpg-xxxxx-a.oregon-postgres.render.com` gibi bir host içerir

### Adım 2: Environment Variable Ekleyin

1. Web Service'inizin **"Environment"** sekmesine gidin
2. Şu değişkeni ekleyin:

```
Key: DATABASE_URL
Value: [External Database URL'in tamamı]
```

**Örnek:**
```
postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com:5432/database
```

### Adım 3: SSL Ayarları

External URL kullanırken SSL zorunludur:

```
Key: DB_SSL
Value: true
```

### Adım 4: Deploy

1. **"Save Changes"** tıklayın
2. **"Manual Deploy"** → **"Deploy latest commit"**

---

## ✅ Çözüm 3: Ayrı Environment Variables (External URL ile)

Eğer `DATABASE_URL` çalışmıyorsa, ayrı ayrı ekleyin:

1. PostgreSQL database'inizin **"Connections"** sekmesinden:
   - **External Host:** `dpg-xxxxx-a.oregon-postgres.render.com`
   - **Port:** `5432`
   - **Database Name:** `task_manager_xxxxx`
   - **User:** `task_manager_xxxxx_user`
   - **Password:** (kopyalayın)

2. Web Service'in **"Environment"** sekmesine ekleyin:

```
DB_HOST=dpg-xxxxx-a.oregon-postgres.render.com
DB_PORT=5432
DB_NAME=task_manager_xxxxx
DB_USER=task_manager_xxxxx_user
DB_PASSWORD=[password]
DB_SSL=true
```

---

## 🔍 Project Kontrolü - Adım Adım

### Render Dashboard'da:

1. **Sol menüden "Projects"** tıklayın
2. Her project'in altında hangi servislerin olduğunu görürsünüz
3. Eğer database ve web service farklı project'lerde ise:
   - İkisini de aynı project'e taşıyın
   - Veya External Database URL kullanın

### Project Oluşturma (İsteğe Bağlı):

1. **"New +"** → **"Project"** tıklayın
2. Project adı verin (örn: `task-manager-project`)
3. Mevcut servisleri bu project'e taşıyın

---

## ⚠️ Önemli Notlar

1. **Internal URL:** Sadece aynı project içindeki servisler arasında çalışır
2. **External URL:** Her yerden erişilebilir, ama SSL zorunlu
3. **Project taşıma:** Servislerin ayarlarını değiştirmez, sadece organizasyonu değiştirir
4. **Deploy:** Project değişikliği sonrası otomatik deploy olur

---

## ✅ Başarı Kontrolü

Deploy sonrası log'larda:

- ❌ `ECONNREFUSED 127.0.0.1:5432` → Hala localhost'a bağlanıyor
- ✅ `Task manager app running` → Başarılı!

---

## 🚀 Hızlı Çözüm Özeti

**En kolay yol:**
1. Her iki servisi de aynı project'e taşıyın
2. Internal Database URL kullanın
3. `DATABASE_URL` environment variable ekleyin
4. Deploy edin

**Alternatif:**
1. External Database URL kullanın
2. `DATABASE_URL` environment variable ekleyin
3. `DB_SSL=true` ekleyin
4. Deploy edin

