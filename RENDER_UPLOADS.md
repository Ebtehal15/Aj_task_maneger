# Render'da Yüklenen Dosyaların Kalıcı Olması

Render (ve benzeri platformlar) her deploy veya restart sonrası dosya sistemini sıfırlar. Bu yüzden görev güncellemesinde yüklenen PDF/dosyalar sonradan açılmaya çalışıldığında **404** hatası verebilir.

## Çözüm: Kalıcı Disk (Persistent Disk)

1. **Render Dashboard** → Projeniz → **Disks** bölümüne gidin.
2. **Add Disk** ile yeni disk ekleyin:
   - **Name:** `uploads`
   - **Mount Path:** `/data`
   - **Size:** İhtiyacınıza göre (örn. 1 GB).
3. **Environment** (Ortam Değişkenleri) kısmına ekleyin:
   - **Key:** `UPLOADS_PATH`
   - **Value:** `/data/uploads`
4. Deploy’u yenileyin.

Bundan sonra yüklenen dosyalar `/data/uploads` altında kalıcı olarak tutulur ve deploy/restart sonrası da erişilebilir olur.

## Diski eklemeden önce yüklenen dosyalar ne olur?

- Render’da **diski eklemeden önce** yüklenen dosyalar, sunucunun **geçici** dosya sistemine kaydedilmişti. Her deploy veya restart sonrası bu dosya sistemi sıfırlandığı için **bu dosyaların kendisi artık sunucuda yok**; geri getirilemez.
- Veritabanında (**task_files** tablosunda) bu dosyalara ait **kayıtlar duruyor**: görev detayında eski ekler hâlâ listelenir, ama linke tıklanınca dosya bulunamadığı için **404** alırsınız.
- **Diski ekledikten ve UPLOADS_PATH’i ayarladıktan sonra** yapılan tüm yeni yüklemeler kalıcı diskte saklanır ve deploy/restart sonrası da açılır.
- Eski ekleri “geri getirmek” mümkün değil; gerekirse kullanıcıların ilgili dosyaları **yeniden yüklemesi** gerekir.

Özet: Diski eklemeden önce yüklenen dosyalar fiilen kayıp; diski ekledikten sonraki yüklemeler kalıcı olur.

## Not

- `UPLOADS_PATH` tanımlı değilse uygulama varsayılan olarak `backend/uploads` kullanır (yerel geliştirme veya disk kullanmayan ortamlar için).
