// Maps the messy free-text `zone` strings stored on rider docs to a clean
// canonical zone label. Add new aliases here as new ones appear in Mongo.
const ZONE_ALIASES: Record<string, string> = {
  "84": "Sector 84",
  "Sector 84": "Sector 84",
  "Sector 84 blinkit store": "Sector 84",
  "Blinkit secter 84": "Sector 84",
  "Sector 13": "Sector 13",
  "Sector 17": "Sector 17",
  "Sector 18": "Sector 18",
  "Sector 55": "Sector 55",
  "Sector 59": "Sector 59",
  "Sector 61": "Sector 61",
  "सेक्टर ५३": "Sector 53",
  "Ejipura": "Ejipura",
  "Ejipura Koramangala ": "Ejipura",
  "Sadduguntepalya": "Sadduguntepalya",
};

export function canonicalZone(raw: string | null | undefined): string {
  if (!raw) return "Unassigned";
  const trimmed = raw.trim();
  return ZONE_ALIASES[trimmed] ?? ZONE_ALIASES[raw] ?? (trimmed || "Unassigned");
}

export function zoneSlug(zone: string): string {
  return zone.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
