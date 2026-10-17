// Server sends DATE columns as plain "YYYY-MM-DD" strings. Format them with plain
// string splitting rather than the Date constructor - a Date built from a date-only
// string is UTC midnight, and toLocaleDateString() reads it back in the browser's
// local timezone, which can roll the displayed day backward in negative-UTC zones.
export function formatDateDMY(dateStr) {
  if (!dateStr) return '';
  const [yyyy, mm, dd] = String(dateStr).slice(0, 10).split('-');
  return `${dd}-${mm}-${yyyy}`;
}

export function toDateInputValue(dateStr) {
  return String(dateStr).slice(0, 10);
}

/**
 * Today's date in the user's own timezone as "YYYY-MM-DD" (what a date input expects).
 * Never use toISOString() for this: it gives the UTC date, which is yesterday for a
 * user in Singapore between midnight and 8 am.
 */
export function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
