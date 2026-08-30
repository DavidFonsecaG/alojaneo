// Formatting helpers. Money is stored as integer cents on the API.

export function formatMoney(
  cents: number | null | undefined,
  currency = "USD",
): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

// Parse an API date into a local Date at midnight (so the calendar day never
// shifts across timezones). Accepts both plain "YYYY-MM-DD" and full ISO
// timestamps like "2027-03-01T00:00:00.000Z" — the API serializes DATE
// columns (via postgres.js Date objects) as the latter, and we only ever
// care about the calendar date, so we take the leading date portion.
export function parseApiDate(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parseApiDate(date));
}

export function formatDateShort(date: string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parseApiDate(date));
}

// Number of nights between two YYYY-MM-DD dates.
export function nights(checkIn: string, checkOut: string): number {
  const ms = parseApiDate(checkOut).getTime() - parseApiDate(checkIn).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

// YYYY-MM-DD for a Date, in local time.
export function toApiDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Value for a <input type="date">: strips any time portion from an API date.
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

// Cents → a "12.00" string for a money <input>. Empty string for null.
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

// A money <input> string → integer cents. NaN-safe (returns 0).
export function inputToCents(dollars: string): number {
  const n = parseFloat(dollars);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
