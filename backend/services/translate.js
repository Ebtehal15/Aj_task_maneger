const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Google gtx yanıtından çeviri metnini çıkarır (tek veya çoklu segment).
 */
function extractFromGooglePayload(parsed) {
  if (!parsed || !Array.isArray(parsed[0])) return '';
  const parts = [];
  for (const seg of parsed[0]) {
    if (seg && typeof seg[0] === 'string' && seg[0].length) {
      parts.push(seg[0]);
    }
  }
  return parts.join('');
}

function stripJsonpOrNoise(raw) {
  let s = String(raw).trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  if (s.startsWith(")]}'")) {
    const nl = s.indexOf('\n');
    s = nl >= 0 ? s.slice(nl + 1).trim() : '';
  }
  return s;
}

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json,*/*',
  'Accept-Language': 'en-US,en;q=0.9'
};

const LANG_MAP = { en: 'en', tr: 'tr', ar: 'ar' };

function norm(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

function httpsPostJson(hostname, pathStr, bodyObj, timeoutMs = 20000) {
  const postData = JSON.stringify(bodyObj);
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname,
        path: pathStr,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData, 'utf8'),
          ...DEFAULT_HEADERS
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: data
          });
        });
      }
    );
    req.on('error', () => resolve({ statusCode: 0, body: '' }));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ statusCode: 0, body: '' });
    });
    req.write(postData, 'utf8');
    req.end();
  });
}

function translateWithGoogleCloudApi(text, targetLang, apiKey) {
  const target = LANG_MAP[targetLang] || 'en';
  const postData = JSON.stringify({
    q: text,
    target,
    format: 'text'
  });
  return new Promise((resolve, reject) => {
    const path =
      '/language/translate/v2?key=' + encodeURIComponent(apiKey);
    const req = https.request(
      {
        hostname: 'translation.googleapis.com',
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData, 'utf8')
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(
              new Error(
                `Cloud Translation HTTP ${res.statusCode}: ${data.slice(0, 300)}`
              )
            );
            return;
          }
          try {
            const j = JSON.parse(data);
            const out = j?.data?.translations?.[0]?.translatedText;
            if (out) resolve(out);
            else reject(new Error('No translation in Cloud API response'));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData, 'utf8');
    req.end();
  });
}

/** Uzun metin / URL limiti için parçala */
function splitForUrl(text, maxLen) {
  const chunks = [];
  let rest = String(text);
  while (rest.length) {
    if (rest.length <= maxLen) {
      chunks.push(rest);
      break;
    }
    let cut = rest.lastIndexOf('\n', maxLen);
    if (cut < maxLen / 2) cut = rest.lastIndexOf(' ', maxLen);
    if (cut < maxLen / 2) cut = maxLen;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, '');
  }
  return chunks;
}

/**
 * Lingva (Google ön ucu) — GET /api/v1/auto/{hedef}/{metin}
 * .env: LINGVA_HOSTS=lingva.ml,lingva.garudalinux.org
 */
async function translateWithLingva(text, target) {
  const envHosts = process.env.LINGVA_HOSTS;
  const hosts = envHosts
    ? envHosts
        .split(',')
        .map((h) => h.trim().replace(/^https?:\/\//, '').split('/')[0])
        .filter(Boolean)
    : ['lingva.ml', 'lingva.garudalinux.org'];

  const maxChunk = 600;
  const chunks = splitForUrl(text, maxChunk);
  const outParts = [];

  for (const chunk of chunks) {
    let piece = null;
    const encoded = encodeURIComponent(chunk);
    for (const host of hosts) {
      const urlStr = `https://${host}/api/v1/auto/${target}/${encoded}`;
      try {
        const { statusCode, data } = await httpGetFollow(urlStr, 8);
        if (statusCode !== 200 || !data) continue;
        const trimmed = String(data).trim();
        if (trimmed[0] !== '{' && trimmed[0] !== '[') continue;
        const j = JSON.parse(trimmed);
        if (j.translation && typeof j.translation === 'string') {
          piece = j.translation;
          break;
        }
      } catch {
        /* try next host */
      }
    }
    if (!piece) return null;
    outParts.push(piece);
  }

  return outParts.join('\n');
}

/**
 * LibreTranslate uyumlu (bazı sunucular 301/anahtar ister; isteğe bağlı).
 * .env: LIBRETRANSLATE_HOST, LIBRETRANSLATE_API_KEY
 */
async function translateWithLibreCompat(text, target) {
  const custom =
    process.env.LIBRETRANSLATE_HOST &&
    String(process.env.LIBRETRANSLATE_HOST).trim();
  if (!custom) return null;

  const hostname = custom.replace(/^https?:\/\//, '').split('/')[0];
  const payload = {
    q: text,
    source: 'auto',
    target,
    format: 'text',
    api_key: process.env.LIBRETRANSLATE_API_KEY || ''
  };

  const { statusCode, body } = await httpsPostJson(
    hostname,
    '/translate',
    payload,
    20000
  );
  if (statusCode !== 200 || !body) return null;
  try {
    const j = JSON.parse(body);
    if (j.translatedText && String(j.translatedText).length) {
      return String(j.translatedText);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function httpGetFollow(urlString, maxRedirects = 8) {
  return new Promise((resolve, reject) => {
    const requestOnce = (urlStr, redirectsLeft) => {
      let url;
      try {
        url = new URL(urlStr);
      } catch (e) {
        reject(e);
        return;
      }
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'GET',
          headers: DEFAULT_HEADERS
        },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirectsLeft > 0
          ) {
            res.resume();
            const next = new URL(res.headers.location, urlStr).href;
            requestOnce(next, redirectsLeft - 1);
            return;
          }
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({ statusCode: res.statusCode, data });
          });
        }
      );
      req.on('error', reject);
      req.end();
    };
    requestOnce(urlString, maxRedirects);
  });
}

async function translateWithGoogleGtx(text, target) {
  const encodedText = encodeURIComponent(text);
  const urlStr = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodedText}`;

  const { statusCode, data } = await httpGetFollow(urlStr);

  if (statusCode !== 200) {
    const hint =
      statusCode === 429
        ? ' (rate limit — optional: GOOGLE_TRANSLATE_API_KEY)'
        : '';
    console.warn(
      '[translate] gtx HTTP',
      statusCode,
      hint,
      String(data).slice(0, 120).replace(/\s+/g, ' ')
    );
    return null;
  }

  const trimmed = stripJsonpOrNoise(data);
  if (!trimmed || trimmed[0] === '<') {
    console.warn(
      '[translate] gtx non-JSON:',
      trimmed.slice(0, 120).replace(/\s+/g, ' ')
    );
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    const out = extractFromGooglePayload(parsed);
    return out || null;
  } catch (err) {
    console.warn('[translate] gtx JSON parse:', err.message);
    return null;
  }
}

/**
 * Sıra: Cloud API → özel LibreTranslate (varsa) → Lingva → gtx
 */
async function translateText(text, targetLang) {
  if (!text || !text.trim()) {
    return text;
  }

  const target = LANG_MAP[targetLang] || 'en';
  const inputNorm = norm(text);

  const cloudKey =
    process.env.GOOGLE_TRANSLATE_API_KEY &&
    String(process.env.GOOGLE_TRANSLATE_API_KEY).trim();
  if (cloudKey) {
    try {
      const out = await translateWithGoogleCloudApi(text, targetLang, cloudKey);
      if (out) return out;
    } catch (err) {
      console.warn('[translate] Cloud API failed:', err.message);
    }
  }

  const tryDiff = (label, out) => {
    if (!out || !String(out).trim()) return false;
    if (norm(out) === inputNorm) return false;
    console.info('[translate] OK via', label);
    return true;
  };

  let candidate = await translateWithLibreCompat(text, target);
  if (tryDiff('LibreTranslate', candidate)) return candidate;

  candidate = await translateWithLingva(text, target);
  if (tryDiff('Lingva', candidate)) return candidate;

  candidate = await translateWithGoogleGtx(text, target);
  if (candidate && norm(candidate) !== inputNorm) {
    console.info('[translate] OK via gtx');
    return candidate;
  }

  if (candidate && norm(candidate) === inputNorm) {
    console.warn(
      '[translate] Output matches input (same language or all backends failed)'
    );
  }
  return text;
}

module.exports = { translateText };
