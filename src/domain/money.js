// Money is always whole cents inside SpecLens and inside the app under test.

export function formatCents(cents) {
  if (!Number.isInteger(cents)) return String(cents);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars}.${rest}`;
}

// Accepts "25", "25.5" or "25.50". Returns whole cents, or null when the text is not a valid amount.
export function parseDollarsToCents(text) {
  const match = /^\s*(\d{1,7})(?:\.(\d{1,2}))?\s*$/.exec(String(text ?? ''));
  if (!match) return null;
  const dollars = Number(match[1]);
  const cents = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
  return dollars * 100 + cents;
}
