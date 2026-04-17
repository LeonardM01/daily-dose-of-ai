import {
  BROWSER_USER_AGENT,
  FETCH_TIMEOUT_MS,
  trimToSentences,
  TRENDING_ITEMS_PER_SOURCE,
  type FetchResult,
  type FetchedTrendingItem,
} from "./types";

const SUBREDDITS = [
  "technology",
  "programming",
  "webdev",
  "MachineLearning",
  "artificial",
] as const;

/** Minimum Reddit score (ups) to include a post. */
const MIN_UPVOTES = 100;
/** Max posts requested per sub (`/top.json` allows up to 100). */
const LIMIT_PARAM = 100;

type RedditListing = {
  data?: {
    children?: Array<{
      kind?: string;
      data?: RedditPost;
    }>;
  };
};

type RedditPost = {
  id?: string;
  title?: string;
  permalink?: string;
  url?: string;
  url_overridden_by_dest?: string;
  selftext?: string;
  ups?: number;
  score?: number;
  num_comments?: number;
  author?: string;
  thumbnail?: string;
  preview?: {
    images?: Array<{ source?: { url?: string } }>;
  };
  over_18?: boolean;
  stickied?: boolean;
};

async function fetchSub(sub: string): Promise<RedditPost[]> {
  const candidates = [
    `https://www.reddit.com/r/${sub}/top.json?t=day&limit=${LIMIT_PARAM}`,
    `https://old.reddit.com/r/${sub}/top.json?t=day&limit=${LIMIT_PARAM}`,
  ];
  let lastErr: unknown = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.status === 429 || res.status === 403) {
        lastErr = new Error(`Reddit ${res.status} for ${url}`);
        continue;
      }
      if (!res.ok) {
        throw new Error(`Reddit ${res.status} ${url}`);
      }
      const json = (await res.json()) as RedditListing;
      return (json.data?.children ?? [])
        .filter((c): c is { kind: string; data: RedditPost } =>
          c.kind === "t3" && c.data !== undefined,
        )
        .map((c) => c.data);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Reddit fetch failed for r/${sub}`);
}

function redditUpvotes(p: RedditPost): number {
  return p.ups ?? p.score ?? 0;
}

function decodeRedditUrl(raw: string): string {
  return raw.replace(/&amp;/g, "&");
}

function pickThumbnail(post: RedditPost): string | null {
  const preview = post.preview?.images?.[0]?.source?.url;
  if (preview) return decodeRedditUrl(preview);
  const thumb = post.thumbnail;
  if (thumb && /^https?:\/\//.test(thumb)) return decodeRedditUrl(thumb);
  return null;
}

function mapPost(post: RedditPost, sub: string): FetchedTrendingItem | null {
  const id = post.id;
  const title = post.title;
  const permalink = post.permalink;
  if (!id || !title || !permalink) return null;

  const externalUrl =
    post.url_overridden_by_dest ??
    post.url ??
    `https://www.reddit.com${permalink}`;

  const description = post.selftext ? trimToSentences(post.selftext, 2) : null;

  return {
    source: "REDDIT",
    externalId: `reddit:${id}`,
    title,
    url: externalUrl,
    description: description ?? null,
    score: post.ups ?? post.score ?? null,
    commentCount: post.num_comments ?? null,
    author: post.author ?? null,
    subsource: `r/${sub}`,
    thumbnailUrl: pickThumbnail(post),
    metadata: {
      permalink: `https://www.reddit.com${permalink}`,
      nsfw: Boolean(post.over_18),
    },
  };
}

export async function fetchReddit(): Promise<FetchResult> {
  const results = await Promise.allSettled(
    SUBREDDITS.map(async (sub) => {
      const posts = await fetchSub(sub);
      return posts
        .filter((p) => !p.stickied && !p.over_18)
        .filter((p) => redditUpvotes(p) >= MIN_UPVOTES)
        .map((p) => mapPost(p, sub))
        .filter((x): x is FetchedTrendingItem => x !== null);
    }),
  );

  const items = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );

  items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = items.slice(0, TRENDING_ITEMS_PER_SOURCE);

  return { source: "REDDIT", items: top };
}
