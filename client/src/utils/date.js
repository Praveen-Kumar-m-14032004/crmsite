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
