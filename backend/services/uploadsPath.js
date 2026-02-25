const path = require('path');
const fs = require('fs');

/**
 * Uploads klasörü yolu.
 * Render gibi platformlarda kalıcı disk kullanmak için ortam değişkeni:
 *   UPLOADS_PATH=/data/uploads  (örnek: Render Persistent Disk mount path)
 * Ayarlanmazsa backend/uploads kullanılır.
 */
function getUploadsDir() {
  const dir = process.env.UPLOADS_PATH
    ? path.resolve(process.env.UPLOADS_PATH)
    : path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getAvatarsDir() {
  const base = getUploadsDir();
  const avatarsDir = path.join(base, 'avatars');
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
  }
  return avatarsDir;
}

/** DB'de saklanan göreli yolu (örn. uploads/avatars/xxx) tam yola çevirir. */
function resolveUploadPath(relativePath) {
  if (!relativePath) return null;
  const rel = relativePath.replace(/^uploads[/\\]/, '');
  return path.join(getUploadsDir(), rel);
}

module.exports = { getUploadsDir, getAvatarsDir, resolveUploadPath };
