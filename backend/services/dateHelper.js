// Türkiye saatine göre tarih formatlama helper'ı
function formatDateForTurkey(date) {
  if (!date) return '-';
  
  try {
    // Eğer string ise Date objesine çevir
    let dateObj;
    if (typeof date === 'string') {
      // PostgreSQL'den gelen timestamp string'i parse et
      // Örnek: "2024-01-15 10:30:00" veya "2024-01-15T10:30:00.000Z"
      dateObj = new Date(date);
    } else {
      dateObj = date;
    }
    
    // TZ environment variable'ı ayarlanmışsa, Date objesi zaten doğru timezone'u kullanır
    // Ama yine de manuel olarak Türkiye saatine çevir (güvenlik için)
    // Türkiye saati (UTC+3, ama yaz saati uygulaması var, bu yüzden dinamik hesaplama yapalım)
    
    // Intl.DateTimeFormat kullanarak Türkiye saatine göre formatla
    const formatter = new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(dateObj);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const hours = parts.find(p => p.type === 'hour').value;
    const minutes = parts.find(p => p.type === 'minute').value;
    const seconds = parts.find(p => p.type === 'second').value;
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (err) {
    console.error('Date formatting error:', err);
    // Fallback: Basit formatlama
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      // Türkiye saati (UTC+3) - basit hesaplama
      const turkeyOffset = 3 * 60; // UTC+3 dakika cinsinden
      const utc = dateObj.getTime() + (dateObj.getTimezoneOffset() * 60000);
      const turkeyTime = new Date(utc + (turkeyOffset * 60000));
      
      const year = turkeyTime.getFullYear();
      const month = String(turkeyTime.getMonth() + 1).padStart(2, '0');
      const day = String(turkeyTime.getDate()).padStart(2, '0');
      const hours = String(turkeyTime.getHours()).padStart(2, '0');
      const minutes = String(turkeyTime.getMinutes()).padStart(2, '0');
      const seconds = String(turkeyTime.getSeconds()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (fallbackErr) {
      // Son çare: Orijinal formatı döndür
      if (typeof date === 'string') {
        return date.slice(0, 19).replace('T', ' ');
      }
      return date.toISOString().slice(0, 19).replace('T', ' ');
    }
  }
}

module.exports = { formatDateForTurkey };



