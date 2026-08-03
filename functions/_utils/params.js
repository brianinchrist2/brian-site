export function clampLimit(raw, def = 20, max = 100) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(1, Math.min(n, max));
}

export function clampOffset(raw) {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}
