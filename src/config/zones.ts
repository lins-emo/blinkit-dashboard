// Hand-curated overrides for non-sector zones (free-text Bengaluru locations).
// Sector-style zones are normalized automatically by the regex below.
const ZONE_OVERRIDES: Record<string, string> = {
  "Ejipura": "Ejipura",
  "Ejipura Koramangala ": "Ejipura",
  "Sadduguntepalya": "Sadduguntepalya",
};

// Devanagari digit → ASCII digit (for "सेक्टर ५३")
const DEV_DIGITS: Record<string, string> = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
  "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
};

export function canonicalZone(raw: string | null | undefined): string {
  if (!raw) return "Unassigned";
  const trimmed = raw.trim();
  if (!trimmed) return "Unassigned";

  // 1. Hand-curated overrides
  if (ZONE_OVERRIDES[trimmed]) return ZONE_OVERRIDES[trimmed];

  // 2. Hindi sector e.g. "सेक्टर ५३"
  const hindi = trimmed.match(/सेक्टर\s*([०-९]+)/);
  if (hindi) {
    const num = hindi[1].split("").map((c) => DEV_DIGITS[c] ?? "").join("");
    if (num) return `Sector ${num}`;
  }

  // 3. Any "sector NN" (handles "Blinkit secter 84", "Sector 84 blinkit store",
  //    "Blinkit store sector 84", "Sector 84 gurgaon", etc.)
  const sector = trimmed.match(/sect[oe]r\s*(\d{1,3})/i);
  if (sector) return `Sector ${sector[1]}`;

  // 4. Bare number like "84"
  if (/^\d{1,3}$/.test(trimmed)) return `Sector ${trimmed}`;

  // 5. As-is fallback
  return trimmed;
}

export function zoneSlug(zone: string): string {
  return zone.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
