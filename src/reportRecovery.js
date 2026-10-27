const KEY = 'wealthguard_report_recovery_v1';
const MAX_AGE = 2 * 60 * 60 * 1000;
export function saveReportRecovery(storage, userId, data, now = Date.now()) {
  if (!userId) return false;
  try { storage.setItem(KEY, JSON.stringify({userId, savedAt: now, data})); return true; }
  catch { return false; }
}
export function readReportRecovery(storage, userId, now = Date.now()) {
  if (!userId) return null;
  try {
    const value = JSON.parse(storage.getItem(KEY) || 'null');
    if (!value || value.userId !== userId) return null;
    if (!Number.isFinite(value.savedAt) || now - value.savedAt < 0 || now - value.savedAt > MAX_AGE) {
      storage.removeItem(KEY); return null;
    }
    return value.data;
  } catch { return null; }
}
export function clearReportRecovery(storage) {
  try { storage.removeItem(KEY); } catch { /* Storage can be unavailable. */ }
}
