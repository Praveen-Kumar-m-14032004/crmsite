/**
 * Calendar-date helpers in the business timezone (APP_TIMEZONE, default
 * Asia/Singapore). The server itself may run in UTC (Render does), so "today"
 * must never come from new Date().toISOString().
 */

function timeZone() {
  return process.env.APP_TIMEZONE || 'Asia/Singapore';
}

/** Today as "YYYY-MM-DD" in the business timezone. */
function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone(), year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date()); // en-CA formats as YYYY-MM-DD
}

/** "YYYY-MM-DD" (or anything starting with it) -> "YYYYMMDD"; falls back to today. */
function datePrefix(dateStr) {
  const text = String(dateStr || '').slice(0, 10);
  return (/^\d{4}-\d{2}-\d{2}$/.test(text) ? text : localToday()).replace(/-/g, '');
}

module.exports = { localToday, datePrefix };
