export function parseDateOnly(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

export function formatDate(dateStr, options = {}) {
  const d = parseDateOnly(dateStr);
  if (!d) return 'N/A';
  const defaults = { day: 'numeric', month: 'short', year: 'numeric' };
  return d.toLocaleDateString('en-IN', { ...defaults, ...options });
}

export function formatDateLong(dateStr) {
  return formatDate(dateStr, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateShort(dateStr) {
  return formatDate(dateStr, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
