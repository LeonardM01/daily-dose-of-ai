const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "mt",
  "inc",
  "ltd",
  "co",
  "corp",
  "vs",
  "etc",
  "u.s",
  "u.k",
  "e.g",
  "i.e",
  "a.m",
  "p.m",
]);

/**
 * Splits humanized transcript text into sentences, merging common
 * abbreviations (Mr., Inc., etc.) back into their following sentence.
 *
 * Preserves the original whitespace between sentences: the joined sentences
 * reconstitute the original string.
 */
export function splitIntoSentences(raw: string): string[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const candidates: string[] = [];
  const regex = /[^.!?\n]+(?:[.!?]+["')\]]*|\n+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const piece = match[0];
    if (!piece.trim()) continue;
    candidates.push(piece);
  }

  const merged: string[] = [];
  for (const current of candidates) {
    const last = merged[merged.length - 1];
    if (last && endsWithAbbreviation(last)) {
      merged[merged.length - 1] = last + current;
      continue;
    }
    merged.push(current);
  }

  return merged.map((s) => s.trim()).filter(Boolean);
}

function endsWithAbbreviation(piece: string): boolean {
  const trimmed = piece.trimEnd();
  if (!trimmed.endsWith(".")) return false;
  const match = /([A-Za-z.]+)\.$/.exec(trimmed);
  if (!match?.[1]) return false;
  const token = match[1].toLowerCase();
  return ABBREVIATIONS.has(token);
}
