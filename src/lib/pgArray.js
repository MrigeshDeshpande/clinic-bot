export function toPgTextArray(arr) {
  if (!Array.isArray(arr)) return arr || null;
  const items = arr.map(a => {
    const s = String(a);
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  });
  return `{${items.join(',')}}`;
}
