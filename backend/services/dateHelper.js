// Türkiye saatine göre tarih formatlama helper'ı
function formatDateForTurkey(date) {
  if (!date) return '-';
  
  try {
    // Eğer string ise Date objesine çevir
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // Türkiye saati (UTC+3)
    const turkeyOffset = 3 * 60; // UTC+3 dakika cinsinden
    const utc = dateObj.getTime() + (dateObj.getTimezoneOffset() * 60000);
    const turkeyTime = new Date(utc + (turkeyOffset * 60000));
    
    // Format: YYYY-MM-DD HH:mm:ss
    const year = turkeyTime.getFullYear();
    const month = String(turkeyTime.getMonth() + 1).padStart(2, '0');
    const day = String(turkeyTime.getDate()).padStart(2, '0');
    const hours = String(turkeyTime.getHours()).padStart(2, '0');
    const minutes = String(turkeyTime.getMinutes()).padStart(2, '0');
    const seconds = String(turkeyTime.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (err) {
    console.error('Date formatting error:', err);
    // Fallback: Orijinal formatı döndür
    if (typeof date === 'string') {
      return date.slice(0, 19).replace('T', ' ');
    }
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }
}

module.exports = { formatDateForTurkey };



