// The theme tokens in index.css are stored as bare HSL triplets ("H S% L%")
// and consumed via hsl(var(--token)). A hotel picks its accent as a #rrggbb
// hex, so we convert it to a triplet at runtime and also pick a readable
// foreground (black/white) for text sitting on that accent.

const HEX = /^#?([0-9a-f]{6})$/i;

export function hexToHslTriplet(hex: string): string | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Ink (dark) on light accents, white on dark ones — as an HSL triplet.
export function readableForegroundTriplet(hex: string): string {
  const m = HEX.exec(hex.trim());
  if (!m) return "0 0% 100%";
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "0 0% 9%" : "0 0% 100%";
}
