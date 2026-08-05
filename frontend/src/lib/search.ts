export function normalizeSearchValue(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^\p{L}\p{N}+]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDigits(value: unknown) {
  return String(value ?? '').replace(/\D+/g, '');
}

export function matchesSearch(fields: unknown[], query: string) {
  const needle = normalizeSearchValue(query);
  if (!needle) return true;

  const textHaystack = fields.map(normalizeSearchValue).filter(Boolean).join(' ');
  if (textHaystack.includes(needle)) return true;

  const digitNeedle = normalizeDigits(query);
  if (digitNeedle.length >= 2) {
    const digitHaystack = fields.map(normalizeDigits).filter(Boolean).join(' ');
    if (digitHaystack.includes(digitNeedle)) return true;
  }

  return false;
}
