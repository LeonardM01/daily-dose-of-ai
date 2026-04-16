import type { TrendingSource } from "../../../../generated/prisma";

export type FetchedTrendingItem = {
  source: TrendingSource;
  externalId: string;
  title: string;
  url: string;
  description: string | null;
  score: number | null;
  commentCount: number | null;
  author: string | null;
  subsource: string | null;
  thumbnailUrl: string | null;
  metadata: Record<string, unknown> | null;
};

export type FetchResult = {
  source: TrendingSource;
  items: FetchedTrendingItem[];
};

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export const FETCH_TIMEOUT_MS = 15000;

export function trimToSentences(raw: string, maxSentences = 2): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const matched = text.match(/[^.!?]+[.!?]+/g);
  if (!matched) return text.slice(0, 280);
  return matched.slice(0, maxSentences).join(" ").trim();
}

export function stripHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
