const https = require('https');

// Google Translate API kullanarak çeviri yapma
async function translateText(text, targetLang) {
  if (!text || !text.trim()) {
    return text;
  }

  // Dil kodlarını Google Translate formatına çevir
  const langMap = {
    'en': 'en',
    'tr': 'tr',
    'ar': 'ar'
  };

  const target = langMap[targetLang] || 'en';
  
  // Basit bir çeviri servisi - Google Translate API kullanmadan
  // Eğer Google Translate API kullanmak isterseniz, API key gerekir
  // Şimdilik basit bir çözüm sunuyoruz
  
  try {
    // Google Translate API'ye istek at (ücretsiz versiyon)
    const encodedText = encodeURIComponent(text);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodedText}`;
    
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result && result[0] && result[0][0] && result[0][0][0]) {
              resolve(result[0][0][0]);
            } else {
              resolve(text); // Çeviri başarısız olursa orijinal metni döndür
            }
          } catch (err) {
            resolve(text); // Hata durumunda orijinal metni döndür
          }
        });
      }).on('error', (err) => {
        console.error('Translate error:', err);
        resolve(text); // Hata durumunda orijinal metni döndür
      });
    });
  } catch (err) {
    console.error('Translate error:', err);
    return text;
  }
}

module.exports = { translateText };




