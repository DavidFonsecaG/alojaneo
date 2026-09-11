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
// shifts across timezones). Accepts "YYYY-MM-DD" or a full ISO timestamp.
export function parseApiDate(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
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
