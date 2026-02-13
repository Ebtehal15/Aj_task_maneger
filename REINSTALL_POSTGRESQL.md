# PostgreSQL'i Kaldırıp Yeniden Kurma Rehberi

## 🗑️ Adım 1: PostgreSQL'i Kaldırma

### Yöntem 1: Control Panel (En Kolay)

1. **Windows + R** → `appwiz.cpl` → Enter
2. **"PostgreSQL"** arayın
3. Tüm PostgreSQL bileşenlerini bulun:
   - PostgreSQL 18 Server
   - PostgreSQL 18 - pgAdmin 4 (opsiyonel)
   - PostgreSQL 18 Command Line Tools (opsiyonel)
4. Her birine sağ tıklayın → **"Uninstall"** (Kaldır)
5. Kaldırma sihirbazını takip edin

### Yöntem 2: PowerShell ile

PowerShell'i **Yönetici olarak** açın:

```powershell
# PostgreSQL servislerini durdur
Get-Service postgresql* | Stop-Service

# PostgreSQL programlarını bul
Get-WmiObject -Class Win32_Product | Where-Object {$_.Name -like "*PostgreSQL*"} | ForEach-Object {$_.Uninstall()}
```

---

## 🧹 Adım 2: Kalan Dosyaları Temizleme

### Klasörleri Silin

1. **Windows Explorer**'da şu klasörleri silin (eğer varsa):
   ```
   C:\Program Files\PostgreSQL
   C:\Program Files (x86)\PostgreSQL
   C:\Users\[KullanıcıAdınız]\AppData\Local\PostgreSQL
   C:\Users\[KullanıcıAdınız]\AppData\Roaming\PostgreSQL
   ```

2. **Registry temizliği (İleri seviye - opsiyonel):**
   - Windows + R → `regedit` → Enter
   - `HKEY_LOCAL_MACHINE\SOFTWARE\PostgreSQL` klasörünü silin
   - **DİKKAT:** Registry düzenlemesi risklidir, sadece gerekirse yapın

### Servis Kayıtlarını Temizle

PowerShell'i **Yönetici olarak** açın:

```powershell
# Kalan servisleri kontrol et
Get-Service postgresql* -ErrorAction SilentlyContinue

# Eğer hala varsa, servis kayıtlarını temizle
sc.exe delete postgresql-x64-18
```

---

## 📥 Adım 3: PostgreSQL'i Yeniden Kurma

### Kurulum Dosyasını İndirin

1. [PostgreSQL Resmi Sitesi](https://www.postgresql.org/download/windows/)'ne gidin
2. **"Download the installer"** tıklayın
3. **PostgreSQL 18** (veya en son sürüm) seçin
4. Windows x86-64 installer'ı indirin

### Kurulum Adımları

1. **İndirilen .exe dosyasını çalıştırın** (Yönetici olarak)

2. **Installation Directory:**
   - Varsayılan: `C:\Program Files\PostgreSQL\18`
   - Değiştirmeyin (önerilen)

3. **Select Components:**
   - ✅ PostgreSQL Server (zorunlu)
   - ✅ pgAdmin 4 (önerilen - GUI aracı)
   - ✅ Stack Builder (opsiyonel - şimdilik atlayabilirsiniz)
   - ✅ Command Line Tools (önerilen)

4. **Data Directory:**
   - Varsayılan: `C:\Program Files\PostgreSQL\18\data`
   - Değiştirmeyin

5. **Password:**
   - **Güçlü bir şifre belirleyin**
   - **Bu şifreyi not edin!** (`.env` dosyasında kullanacaksınız)
   - Örnek: `MySecurePass123!`

6. **Port:**
   - Varsayılan: `5432`
   - Değiştirmeyin

7. **Advanced Options:**
   - **Locale:** `DEFAULT` bırakın (UTF-8 otomatik)
   - Diğer ayarları varsayılan bırakın

8. **Pre Installation Summary:**
   - Ayarları kontrol edin
   - **Next** tıklayın

9. **Ready to Install:**
   - **Next** tıklayın
   - Kurulum başlar

10. **Completing the PostgreSQL Setup:**
    - ✅ **Launch Stack Builder** işaretini kaldırın (şimdilik gerek yok)
    - **Finish** tıklayın

---

## ✅ Adım 4: Kurulum Sonrası Kontrol

### Servis Kontrolü

PowerShell'de:

```powershell
Get-Service postgresql*
```

**Çıktı:**
```
Status   Name               DisplayName
------   ----               -----------
Running  postgresql-x64-18  PostgreSQL 18 Server
```

**Running** görünmelidir.

### Bağlantı Testi

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres
```

**Şifre isteyecek:** Kurulum sırasında belirlediğiniz şifreyi girin.

**Başarılı olduğunda:**
```
postgres=#
```

Bu prompt'u görüyorsanız bağlantı başarılı!

---

## 🗄️ Adım 5: Veritabanını Oluşturun

Bağlantı başarılı olduktan sonra:

```sql
CREATE DATABASE task_manager 
  WITH ENCODING 'UTF8' 
  LC_COLLATE='en_US.UTF-8' 
  LC_CTYPE='en_US.UTF-8'
  TEMPLATE=template0;
```

**Çıktı:**
```
CREATE DATABASE
```

**Çıkış:**
```sql
\q
```

---

## 📝 Adım 6: .env Dosyasını Güncelleyin

Proje klasöründe `.env` dosyasını oluşturun/güncelleyin:

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=your-secret-key-here
APP_BASE_URL=http://localhost:3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=task_manager
DB_USER=postgres
DB_PASSWORD=kurulumda-belirlediginiz-sifre
DB_SSL=false
```

**Önemli:** `DB_PASSWORD` kısmına kurulum sırasında belirlediğiniz şifreyi yazın!

---

## 🚀 Adım 7: Uygulamayı Başlatın

```bash
npm install
npm start
```

---

## ✅ Kontrol Listesi

- [ ] Eski PostgreSQL kaldırıldı
- [ ] Kalan dosyalar temizlendi
- [ ] PostgreSQL yeniden kuruldu
- [ ] Şifre belirlendi ve not edildi
- [ ] Servis çalışıyor (`Get-Service postgresql*`)
- [ ] Bağlantı test edildi (`psql -U postgres`)
- [ ] Veritabanı oluşturuldu (`task_manager`)
- [ ] `.env` dosyası güncellendi
- [ ] Uygulama başlatıldı (`npm start`)

---

## 🆘 Sorun Giderme

### Kurulum sırasında hata

- Antivirus'ü geçici olarak kapatın
- Windows Defender'ı kontrol edin
- Yönetici olarak çalıştırdığınızdan emin olun

### Servis başlamıyor

- Windows Event Viewer'da hataları kontrol edin
- Kurulumu tekrar deneyin
- Bilgisayarı yeniden başlatın

### Şifreyi unuttum

- PostgreSQL'i kaldırıp yeniden kurun
- Veya `pg_hba.conf` dosyasını düzenleyerek şifresiz giriş yapın (güvenlik riski!)

---

## 📚 Sonraki Adımlar

Kurulum tamamlandıktan sonra:
- `QUICK_START.md` dosyasındaki adımları takip edin
- Uygulamayı test edin
- Production'a deploy için `DEPLOYMENT.md` dosyasına bakın

