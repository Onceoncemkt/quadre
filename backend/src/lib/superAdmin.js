function getSuperAdminEmailsSet() {
  const raw = process.env.SUPER_ADMIN_EMAILS || '';
  const emails = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return new Set(emails);
}

function isSuperAdminEmail(email) {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  return getSuperAdminEmailsSet().has(normalized);
}

module.exports = { isSuperAdminEmail };
