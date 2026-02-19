# PWA Kurulum Test Rehberi (Localhost)

Bu rehber, uygulamayı localhost'ta test etmek için gerekli adımları içerir.

## Adım 1: Uygulamayı Başlat

Terminal'de proje dizininde:

```bash
npm start
```

veya development modu için:

```bash
npm run dev
```

Uygulama `http://localhost:3000` adresinde çalışacaktır.

## Adım 2: Chrome'da Uygulamayı Aç

1. Chrome tarayıcısını açın
2. `http://localhost:3000` adresine gidin
3. Giriş yapın (admin/admin123 veya user/user123)

## Adım 3: Chrome DevTools'u Aç

1. **F12** tuşuna basın veya
2. Sağ tıklayın → **İncele** (Inspect)
3. DevTools penceresi açılacak

## Adım 4: Console'da Debug Log'larını Kontrol Et

**Console** sekmesine gidin ve şu log'ları kontrol edin:

```
Service worker registered: http://localhost:3000/
Manifest.json accessible: true
PWA Installability Check:
- Service Worker: true
- Manifest link: Found
- Deferred prompt: Available (veya Not available)
- Display mode: Browser
- Manifest valid: Yes
- Manifest name: AJ İş Takip - Görev Yönetim Sistemi
- Manifest icons: 2
```

Eğer hata görüyorsanız, hata mesajını not edin.

## Adım 5: Application Sekmesinde Kontrol Et

1. DevTools'da **Application** sekmesine gidin
2. Sol menüden **Manifest** seçeneğine tıklayın
   - Manifest.json'ın yüklendiğini görmelisiniz
   - İkonların göründüğünü kontrol edin
   - "Add to homescreen" butonu görünüyorsa, PWA kurulabilir demektir

3. Sol menüden **Service Workers** seçeneğine tıklayın
   - Service worker'ın **activated and is running** durumunda olduğunu kontrol edin
   - Eğer hata varsa, **Unregister** butonuna tıklayıp sayfayı yenileyin

## Adım 6: PWA Kurulum Butonunu Kontrol Et

1. Sayfanın sağ üst köşesinde **"Yükle"** butonunu arayın
2. Eğer görünmüyorsa:
   - Console'da `beforeinstallprompt` event'inin tetiklendiğini kontrol edin
   - Service worker'ın kayıtlı olduğundan emin olun
   - Manifest.json'ın erişilebilir olduğundan emin olun

## Adım 7: Manuel Kurulum Testi

Eğer buton görünmüyorsa, Chrome'un kendi kurulum özelliğini kullanabilirsiniz:

### Desktop Chrome:
1. Adres çubuğunun sağındaki **yükleme ikonu** (⬇️) görünüyorsa tıklayın
2. Veya **Menü** (⋮) → **Uygulamayı yükle** seçeneğini kullanın

### Mobil Chrome (Android):
1. Menü (⋮) → **Ana ekrana ekle** seçeneğini kullanın

## Adım 8: Kurulum Sonrası Test

1. Uygulama kurulduktan sonra, masaüstünde veya uygulamalar listesinde görünecektir
2. Uygulamayı açın
3. Standalone modda açıldığını kontrol edin (tarayıcı çerçevesi olmadan)
4. Console'da `Display mode: Standalone` görünmelidir

## Sorun Giderme

### Service Worker Kayıt Edilmiyor

1. Application → Service Workers sekmesine gidin
2. Eski service worker'ları **Unregister** edin
3. Sayfayı yenileyin (Ctrl+F5 veya Cmd+Shift+R)
4. Console'da hata mesajlarını kontrol edin

### Manifest.json Bulunamıyor

1. Tarayıcıda `http://localhost:3000/manifest.json` adresine gidin
2. JSON içeriğinin göründüğünü kontrol edin
3. Eğer 404 hatası alıyorsanız, server.js'de route'un doğru olduğundan emin olun

### İkonlar Görünmüyor

1. `http://localhost:3000/public/img/site_ikon.png` adresine gidin
2. İkonun göründüğünü kontrol edin
3. Eğer 404 hatası alıyorsanız, dosyanın doğru yolda olduğundan emin olun

### beforeinstallprompt Event Tetiklenmiyor

Bu durumda şunları kontrol edin:

1. **HTTPS veya localhost kullanıyor musunuz?** (HTTP üzerinde çalışmaz)
2. **Service worker kayıtlı mı?**
3. **Manifest.json geçerli mi?**
4. **İkonlar erişilebilir mi?**
5. **Uygulama zaten yüklü mü?** (Standalone modda çalışıyorsa buton görünmez)

### Chrome'da "Uygulamayı yükle" Seçeneği Görünmüyor

1. Chrome'un güncel olduğundan emin olun
2. Chrome'da `chrome://flags` adresine gidin
3. "PWA" araması yapın
4. İlgili flag'lerin aktif olduğundan emin olun
5. Chrome'u yeniden başlatın

## Test Checklist

- [ ] Uygulama localhost'ta çalışıyor
- [ ] Service worker kayıtlı
- [ ] Manifest.json erişilebilir
- [ ] İkonlar görünüyor
- [ ] Console'da hata yok
- [ ] "Yükle" butonu görünüyor (veya Chrome'un kendi kurulum özelliği çalışıyor)
- [ ] Uygulama başarıyla kuruldu
- [ ] Standalone modda açılıyor

## Önemli Notlar

- **Localhost'ta HTTP çalışır** (HTTPS gerekmez)
- **Production'da HTTPS gerekir** (Render, Railway vb. otomatik sağlar)
- **Service worker değişikliklerinde** sayfayı hard refresh yapın (Ctrl+F5)
- **Eski service worker'ları** temizlemek için Application → Service Workers → Unregister kullanın

