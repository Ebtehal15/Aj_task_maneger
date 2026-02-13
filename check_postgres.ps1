# PostgreSQL Kurulum Kontrolü ve Veritabanı Oluşturma Scripti

Write-Host "PostgreSQL Kurulum Kontrolü..." -ForegroundColor Cyan

# PostgreSQL'in kurulu olup olmadığını kontrol et
$postgresPaths = @(
    "C:\Program Files\PostgreSQL\18\bin",
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\15\bin",
    "C:\Program Files\PostgreSQL\14\bin",
    "C:\Program Files\PostgreSQL\13\bin"
)

$foundPath = $null
foreach ($path in $postgresPaths) {
    if (Test-Path $path) {
        $foundPath = $path
        Write-Host "✓ PostgreSQL bulundu: $path" -ForegroundColor Green
        break
    }
}

if (-not $foundPath) {
    Write-Host "✗ PostgreSQL bin klasörü bulunamadı!" -ForegroundColor Red
    Write-Host "Lütfen PostgreSQL'in kurulu olduğundan emin olun." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternatif konumları kontrol ediliyor..." -ForegroundColor Yellow
    
    # Tüm sürücülerde ara
    $allPaths = Get-ChildItem -Path "C:\Program Files" -Filter "PostgreSQL" -Directory -ErrorAction SilentlyContinue
    if ($allPaths) {
        Write-Host "Bulunan PostgreSQL klasörleri:" -ForegroundColor Cyan
        foreach ($pgDir in $allPaths) {
            $binPath = Join-Path $pgDir.FullName "bin"
            if (Test-Path $binPath) {
                Write-Host "  - $binPath" -ForegroundColor Green
                $foundPath = $binPath
            }
        }
    }
    
    if (-not $foundPath) {
        Write-Host ""
        Write-Host "PostgreSQL bulunamadı. Lütfen PostgreSQL'i kurun veya pgAdmin 4 kullanın." -ForegroundColor Red
        exit
    }
}

$psqlPath = Join-Path $foundPath "psql.exe"

if (Test-Path $psqlPath) {
    Write-Host "✓ psql.exe bulundu: $psqlPath" -ForegroundColor Green
    Write-Host ""
    
    # Veritabanı oluşturma
    Write-Host "Veritabanı oluşturuluyor..." -ForegroundColor Cyan
    Write-Host "Lütfen PostgreSQL şifrenizi girin:" -ForegroundColor Yellow
    Write-Host ""
    
    $sqlCommand = @"
CREATE DATABASE task_manager 
  WITH ENCODING 'UTF8' 
  LC_COLLATE='en_US.UTF-8' 
  LC_CTYPE='en_US.UTF-8'
  TEMPLATE=template0;
"@
    
    # SQL komutunu geçici dosyaya yaz
    $tempFile = [System.IO.Path]::GetTempFileName()
    $sqlCommand | Out-File -FilePath $tempFile -Encoding UTF8
    
    Write-Host "Komut çalıştırılıyor: $psqlPath -U postgres -f $tempFile" -ForegroundColor Gray
    Write-Host ""
    
    & $psqlPath -U postgres -f $tempFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ Veritabanı başarıyla oluşturuldu!" -ForegroundColor Green
        Write-Host "  Database: task_manager" -ForegroundColor Green
        Write-Host "  Encoding: UTF8" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "✗ Hata oluştu. Lütfen şifrenizi kontrol edin." -ForegroundColor Red
    }
    
    # Geçici dosyayı sil
    Remove-Item $tempFile -ErrorAction SilentlyContinue
    
} else {
    Write-Host "✗ psql.exe bulunamadı!" -ForegroundColor Red
}

Write-Host ""
Write-Host "Devam etmek için QUICK_START.md dosyasındaki Adım 2'ye geçin." -ForegroundColor Cyan

