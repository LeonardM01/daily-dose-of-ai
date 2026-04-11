/**
 * Returns a safe href for user-controlled URLs (e.g. from RSS). Only http/https are allowed.
 */
export function getSafeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}
