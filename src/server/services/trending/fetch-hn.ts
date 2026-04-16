import {
  BROWSER_USER_AGENT,
  FETCH_TIMEOUT_MS,
  stripHtml,
  trimToSentences,
  type FetchResult,
  type FetchedTrendingItem,
} from "./types";

const TOP_STORIES_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
const ITEM_URL = (id: number) =>
  `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

const TOP_IDS_TO_SCAN = 30;
const MAX_ITEMS = 10;
const DAY_SECONDS = 86_400;

type HnItem = {
  id: number;
  type?: string;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number;
  by?: string;
  time?: number;
  deleted?: boolean;
  dead?: boolean;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HN ${res.status} ${res.statusText} ${url}`);
  }
  return (await res.json()) as T;
}

function hostFromUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function buildDescription(item: HnItem): string | null {
  if (item.text) {
    const plain = stripHtml(item.text);
    if (plain) return trimToSentences(plain, 2);
  }
  const host = hostFromUrl(item.url);
  return host ? `Link shared from ${host}.` : null;
}

export async function fetchHackerNews(): Promise<FetchResult> {
  const topIds = await fetchJson<number[]>(TOP_STORIES_URL);
  const candidates = topIds.slice(0, TOP_IDS_TO_SCAN);

  const settled = await Promise.allSettled(
    candidates.map((id) => fetchJson<HnItem>(ITEM_URL(id))),
  );

  const nowSec = Math.floor(Date.now() / 1000);
  const items = settled
    .flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
    .filter(
      (it) =>
        !!it &&
        !it.deleted &&
        !it.dead &&
        it.type === "story" &&
        typeof it.time === "number" &&
        it.time > nowSec - DAY_SECONDS &&
        typeof it.title === "string",
    )
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, MAX_ITEMS);

  const mapped: FetchedTrendingItem[] = items.map((it) => {
    const title = it.title ?? "(untitled)";
    const url = it.url ?? `https://news.ycombinator.com/item?id=${it.id}`;
    return {
      source: "HACKER_NEWS",
      externalId: `hn:${it.id}`,
      title,
      url,
      description: buildDescription(it),
      score: it.score ?? null,
      commentCount: it.descendants ?? null,
      author: it.by ?? null,
      subsource: hostFromUrl(it.url),
      thumbnailUrl: null,
      metadata: {
        hnUrl: `https://news.ycombinator.com/item?id=${it.id}`,
        time: it.time,
      },
    };
  });

  return { source: "HACKER_NEWS", items: mapped };
}
