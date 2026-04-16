import {
  BROWSER_USER_AGENT,
  FETCH_TIMEOUT_MS,
  trimToSentences,
  type FetchResult,
  type FetchedTrendingItem,
} from "./types";

const HOMEPAGE_URL = "https://www.producthunt.com/";
const MAX_ITEMS = 10;

type MaybePost = {
  id?: string | number;
  slug?: string;
  name?: string;
  tagline?: string;
  description?: string;
  votesCount?: number;
  commentsCount?: number;
  thumbnail?: { url?: string; imageUuid?: string } | null;
  media?: Array<{ url?: string }>;
  url?: string;
};

function extractNextData(html: string): unknown {
  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(
    html,
  );
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function walkForPosts(node: unknown, out: Map<string, MaybePost>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const el of node) walkForPosts(el, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const typename = obj.__typename;
  if (
    typename === "Post" &&
    typeof obj.slug === "string" &&
    typeof obj.name === "string"
  ) {
    const key = obj.slug;
    const existing = out.get(key);
    const candidate: MaybePost = {
      id: obj.id as string | number | undefined,
      slug: obj.slug,
      name: obj.name,
      tagline: obj.tagline as string | undefined,
      description: obj.description as string | undefined,
      votesCount: (obj.votesCount ?? obj.userVotesCount) as number | undefined,
      commentsCount: obj.commentsCount as number | undefined,
      thumbnail: obj.thumbnail as MaybePost["thumbnail"],
      media: obj.media as MaybePost["media"],
      url: obj.url as string | undefined,
    };
    if (!existing || (candidate.votesCount ?? 0) > (existing.votesCount ?? 0)) {
      out.set(key, candidate);
    }
  }
  for (const value of Object.values(obj)) walkForPosts(value, out);
}

function buildProductUrl(slug: string): string {
  return `https://www.producthunt.com/posts/${slug}`;
}

function pickThumbnail(post: MaybePost): string | null {
  if (post.thumbnail?.url) return post.thumbnail.url;
  const media = post.media?.[0]?.url;
  if (media) return media;
  return null;
}

function mapPost(post: MaybePost): FetchedTrendingItem | null {
  if (!post.slug || !post.name) return null;
  const tagline = post.tagline?.trim() ?? "";
  const desc = post.description ? trimToSentences(post.description, 2) : "";
  const description = tagline || desc || null;

  return {
    source: "PRODUCT_HUNT",
    externalId: `ph:${post.slug}`,
    title: post.name,
    url: buildProductUrl(post.slug),
    description,
    score: post.votesCount ?? null,
    commentCount: post.commentsCount ?? null,
    author: null,
    subsource: null,
    thumbnailUrl: pickThumbnail(post),
    metadata: {
      slug: post.slug,
      launchUrl: post.url ?? null,
    },
  };
}

export async function fetchProductHunt(): Promise<FetchResult> {
  const res = await fetch(HOMEPAGE_URL, {
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Product Hunt ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const nextData = extractNextData(html);
  if (!nextData) {
    throw new Error("Product Hunt: __NEXT_DATA__ not found");
  }

  const bucket = new Map<string, MaybePost>();
  walkForPosts(nextData, bucket);

  const items = [...bucket.values()]
    .sort((a, b) => (b.votesCount ?? 0) - (a.votesCount ?? 0))
    .slice(0, MAX_ITEMS)
    .map(mapPost)
    .filter((x): x is FetchedTrendingItem => x !== null);

  return { source: "PRODUCT_HUNT", items };
}
