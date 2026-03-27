const { getDb } = require('./db');

function getClientIp(req) {
  if (!req) return null;
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) {
    const first = String(xff).split(',')[0].trim();
    if (first) return first.slice(0, 45);
  }
  if (req.ip) return String(req.ip).slice(0, 45);
  if (req.socket && req.socket.remoteAddress) return String(req.socket.remoteAddress).slice(0, 45);
  return null;
}

/**
 * Fire-and-forget audit row. Never throws to callers.
 * @param {import('express').Request|null} req
 * @param {{ action: string, entityType?: string|null, entityId?: number|null, details?: object|null, userId?: number|null, username?: string|null }} opts
 */
function logAudit(req, opts) {
  if (!opts || !opts.action) return;
  const {
    action,
    entityType = null,
    entityId = null,
    details = null,
    userId: explicitUserId,
    username: explicitUsername
  } = opts;

  const uid =
    explicitUserId !== undefined && explicitUserId !== null
      ? explicitUserId
      : req && req.user
        ? req.user.id
        : null;
  const uname =
    explicitUsername !== undefined && explicitUsername !== null
      ? explicitUsername
      : req && req.user
        ? req.user.username
        : null;

  const pool = getDb();
  const ip = req ? getClientIp(req) : null;
  const ua = req && req.headers ? req.headers['user-agent'] || null : null;
  const detailsPayload = details === undefined ? null : details;

  pool
    .query(
      `INSERT INTO audit_log (user_id, username_snapshot, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [uid, uname, action, entityType, entityId, detailsPayload, ip, ua]
    )
    .catch((err) => console.error('[audit_log] insert failed:', err.message));
}

module.exports = {
  logAudit,
  getClientIp
};
