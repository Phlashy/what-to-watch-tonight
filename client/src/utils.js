/**
 * Safely parse a JSON string, returning a fallback on failure.
 * Used extensively for genre, cast, tags, and people fields.
 */
export function parseJSON(str, fallback = []) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}
