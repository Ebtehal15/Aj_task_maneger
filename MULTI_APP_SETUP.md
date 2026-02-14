# Aynı Sunucuda Birden Fazla Uygulama Çalıştırma Rehberi

Bu rehber, aynı sunucuda birden fazla uygulama çalıştırırken nasıl yapılandırma yapacağınızı açıklar.

## 🎯 Senaryo

- **Mevcut uygulama:** Port 80'de çalışıyor
- **Task Manager:** Aynı sunucuda farklı portta çalışacak

## 📋 Çözüm Seçenekleri

### Seçenek 1: Farklı Port Kullanmak (En Basit)

#### Adım 1: Port Seçimi

Yaygın kullanılan portlar:
- `3000` - Node.js için yaygın
- `3001` - Alternatif
- `8080` - Web uygulamaları için yaygın
- `5000` - Alternatif

**Öneri:** `3000` veya `8080` kullanın.

#### Adım 2: Environment Variable Ayarlama

`.env` dosyasında:

```env
PORT=3000
# veya
PORT=8080
```

#### Adım 3: Firewall Ayarları

Sunucunuzda seçtiğiniz portu açın:

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 3000/tcp

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload

# iptables
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
```

#### Adım 4: Erişim

Uygulamanıza şu şekilde erişebilirsiniz:
- `http://your-server-ip:3000`
- `http://your-domain.com:3000`

---

### Seçenek 2: Nginx Reverse Proxy (Önerilen - Production)

Bu yöntemle her iki uygulamayı da port 80'den erişilebilir yapabilirsiniz:
- Mevcut uygulama: `http://your-domain.com` (port 80)
- Task Manager: `http://your-domain.com/tasks` veya `http://tasks.your-domain.com`

#### Adım 1: Nginx Kurulumu

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

#### Adım 2: Task Manager'ı Farklı Portta Çalıştırın

`.env` dosyasında:
```env
PORT=3000
```

#### Adım 3: Nginx Yapılandırması

**Yöntem A: Subdomain Kullanarak**

`/etc/nginx/sites-available/task-manager` dosyası oluşturun:

```nginx
server {
    listen 80;
    server_name tasks.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Yöntem B: Path Kullanarak**

Mevcut Nginx yapılandırmanıza ekleyin:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Mevcut uygulamanız
    location / {
        proxy_pass http://localhost:80;  # veya mevcut uygulamanızın portu
        # ... mevcut ayarlarınız
    }

    # Task Manager
    location /tasks {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Path rewrite (opsiyonel)
        rewrite ^/tasks/?(.*) /$1 break;
    }
}
```

#### Adım 4: Nginx'i Aktif Edin ve Yeniden Başlatın

```bash
# Subdomain yöntemi için
sudo ln -s /etc/nginx/sites-available/task-manager /etc/nginx/sites-enabled/
sudo nginx -t  # Yapılandırmayı test et
sudo systemctl reload nginx

# Path yöntemi için (mevcut config'i düzenlediyseniz)
sudo nginx -t
sudo systemctl reload nginx
```

#### Adım 5: DNS Ayarları (Subdomain için)

Subdomain kullanıyorsanız DNS'e kayıt ekleyin:
```
tasks.your-domain.com  A  your-server-ip
```

#### Erişim

- Subdomain: `http://tasks.your-domain.com`
- Path: `http://your-domain.com/tasks`

---

### Seçenek 3: Apache Reverse Proxy

Apache kullanıyorsanız:

#### Adım 1: Modülleri Aktif Edin

```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod rewrite
```

#### Adım 2: Virtual Host Yapılandırması

`/etc/apache2/sites-available/task-manager.conf`:

```apache
<VirtualHost *:80>
    ServerName tasks.your-domain.com

    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/

    <Proxy *>
        Order deny,allow
        Allow from all
    </Proxy>
</VirtualHost>
```

#### Adım 3: Aktif Edin

```bash
sudo a2ensite task-manager
sudo systemctl reload apache2
```

---

## 🔧 Environment Variables Güncellemesi

Task Manager için `.env` dosyasında:

```env
# Port ayarı
PORT=3000

# Base URL (reverse proxy kullanıyorsanız)
APP_BASE_URL=http://tasks.your-domain.com
# veya
APP_BASE_URL=http://your-domain.com/tasks

# Diğer ayarlar...
DB_HOST=localhost
DB_PORT=5432
DB_NAME=task_manager
DB_USER=postgres
DB_PASSWORD=your-password
```

---

## 🚀 PM2 ile Process Yönetimi

Production'da PM2 kullanarak uygulamayı yönetin:

```bash
# PM2 kurulumu
npm install -g pm2

# Uygulamayı başlat
cd /path/to/task_maneger
pm2 start backend/server.js --name task-manager

# Otomatik başlatma
pm2 startup
pm2 save

# Durum kontrolü
pm2 status
pm2 logs task-manager
```

---

## 📊 Port Kullanımını Kontrol Etme

Hangi portların kullanıldığını görmek için:

```bash
# Linux
sudo netstat -tulpn | grep LISTEN
# veya
sudo ss -tulpn | grep LISTEN

# Port 3000'i kontrol et
sudo lsof -i :3000
```

---

## ✅ Önerilen Yapılandırma

**Development/Test için:**
- Port 3000 kullanın
- Direkt port üzerinden erişin: `http://server-ip:3000`

**Production için:**
- Nginx reverse proxy kullanın
- Subdomain: `http://tasks.your-domain.com`
- Port 3000 backend'de kalır (dışarıdan erişilemez)
- SSL/HTTPS ekleyin (Let's Encrypt)

---

## 🔒 Güvenlik Notları

1. **Firewall:** Sadece gerekli portları açın
2. **Reverse Proxy:** Backend portunu (3000) dışarıdan erişilemez yapın
3. **SSL:** Production'da HTTPS kullanın (Let's Encrypt)
4. **Rate Limiting:** Nginx'de rate limiting ekleyin

---

## 🆘 Sorun Giderme

### Port zaten kullanılıyor

```bash
# Hangi process portu kullanıyor?
sudo lsof -i :3000

# Process'i durdur
sudo kill -9 <PID>
```

### Nginx 502 Bad Gateway

- Task Manager'ın çalıştığından emin olun
- Port numarasını kontrol edin
- Firewall ayarlarını kontrol edin

### Erişim sorunları

- Firewall kurallarını kontrol edin
- DNS ayarlarını kontrol edin (subdomain için)
- Nginx/Apache log'larını kontrol edin

---

## 📝 Örnek Senaryolar

### Senaryo 1: Basit Port Kullanımı
```
Mevcut App: http://your-domain.com:80
Task Manager: http://your-domain.com:3000
```

### Senaryo 2: Nginx Subdomain
```
Mevcut App: http://your-domain.com
Task Manager: http://tasks.your-domain.com
```

### Senaryo 3: Nginx Path
```
Mevcut App: http://your-domain.com
Task Manager: http://your-domain.com/tasks
```


