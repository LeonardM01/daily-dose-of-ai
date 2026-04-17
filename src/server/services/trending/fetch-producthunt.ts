import { env } from "~/env";

import {
  BROWSER_USER_AGENT,
  FETCH_TIMEOUT_MS,
  trimToSentences,
  TRENDING_ITEMS_PER_SOURCE,
  type FetchResult,
  type FetchedTrendingItem,
} from "./types";

const GRAPHQL_URL = "https://api.producthunt.com/v2/api/graphql";
const OAUTH_TOKEN_URL = "https://api.producthunt.com/v2/oauth/token";
const HOMEPAGE_URL = "https://www.producthunt.com/";
const MAX_ITEMS = TRENDING_ITEMS_PER_SOURCE;

async function fetchProductHuntAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": BROWSER_USER_AGENT,
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  const body = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || typeof body.access_token !== "string") {
    const detail =
      body.error && body.error_description
        ? `${body.error}: ${body.error_description}`
        : JSON.stringify(body);
    throw new Error(
      `Product Hunt OAuth token exchange failed (${res.status}): ${detail}`,
    );
  }
  return body.access_token;
}

const TRENDING_POSTS_QUERY = `
  query TrendingPosts($first: Int!, $postedAfter: DateTime!) {
    posts(first: $first, order: VOTES, postedAfter: $postedAfter) {
      edges {
        node {
          id
          slug
          name
          tagline
          description
          votesCount
          commentsCount
          url
          website
          thumbnail {
            url
          }
          media {
            url
          }
          user {
            username
            name
          }
        }
      }
    }
  }
`;

type MaybePost = {
  id?: string | number;
  slug?: string;
  name?: string;
  tagline?: string;
  description?: string;
  votesCount?: number;
  commentsCount?: number;
  thumbnail?: { url?: string } | null;
  media?: Array<{ url?: string }>;
  url?: string;
};

type PhGraphNode = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description?: string | null;
  votesCount: number;
  commentsCount: number;
  url: string;
  website: string;
  thumbnail?: { url?: string | null } | null;
  media?: Array<{ url?: string | null } | null> | null;
  user?: { username?: string | null; name?: string | null } | null;
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

function mapScrapedPost(post: MaybePost): FetchedTrendingItem | null {
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

function mapApiNode(node: PhGraphNode): FetchedTrendingItem {
  const tagline = node.tagline?.trim() ?? "";
  const desc = node.description
    ? trimToSentences(node.description, 2)
    : "";
  const description = tagline || desc || null;
  const thumb =
    node.thumbnail?.url ??
    node.media?.find((m) => m?.url)?.url ??
    null;
  const author =
    node.user?.username ??
    node.user?.name?.trim() ??
    null;

  return {
    source: "PRODUCT_HUNT",
    externalId: `ph:${node.slug}`,
    title: node.name,
    url: buildProductUrl(node.slug),
    description,
    score: node.votesCount,
    commentCount: node.commentsCount,
    author,
    subsource: null,
    thumbnailUrl: thumb,
    metadata: {
      slug: node.slug,
      launchUrl: node.website || null,
      phPostUrl: node.url,
    },
  };
}

function formatGraphQLErrors(errors: unknown): string {
  if (!Array.isArray(errors) || errors.length === 0) {
    return "Unknown GraphQL error";
  }
  return errors
    .map((e) => {
      if (e && typeof e === "object") {
        const o = e as Record<string, unknown>;
        if (typeof o.message === "string") return o.message;
        if (
          typeof o.error === "string" &&
          typeof o.error_description === "string"
        ) {
          return `${o.error}: ${o.error_description}`;
        }
        if (typeof o.error === "string") return o.error;
      }
      return String(e);
    })
    .join("; ");
}

function isPhGraphNode(raw: unknown): raw is PhGraphNode {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.slug === "string" &&
    typeof o.name === "string" &&
    typeof o.votesCount === "number" &&
    typeof o.commentsCount === "number" &&
    typeof o.url === "string" &&
    typeof o.website === "string"
  );
}

async function fetchProductHuntGraphQL(token: string): Promise<FetchResult> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": BROWSER_USER_AGENT,
    },
    body: JSON.stringify({
      query: TRENDING_POSTS_QUERY,
      variables: {
        first: MAX_ITEMS,
        postedAfter: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });

  const body = (await res.json()) as {
    data?: {
      posts?: {
        edges?: Array<{ node?: unknown } | null> | null;
      } | null;
    } | null;
    errors?: unknown;
  };

  if (!res.ok) {
    throw new Error(
      `Product Hunt API ${res.status} ${res.statusText}: ${formatGraphQLErrors(body.errors)}`,
    );
  }
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error(`Product Hunt API: ${formatGraphQLErrors(body.errors)}`);
  }

  const edges = body.data?.posts?.edges ?? [];
  const items: FetchedTrendingItem[] = [];
  for (const edge of edges) {
    const node = edge?.node;
    if (isPhGraphNode(node)) {
      items.push(mapApiNode(node));
    }
  }

  if (items.length === 0) {
    throw new Error(
      "Product Hunt API returned no posts (check token scopes and query)",
    );
  }

  return { source: "PRODUCT_HUNT", items };
}

async function fetchProductHuntScrape(): Promise<FetchResult> {
  const res = await fetch(HOMEPAGE_URL, {
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error(
        "Product Hunt 403 Forbidden (homepage blocks automated fetches). Set PRODUCT_HUNT_TOKEN (developer token) or PRODUCT_HUNT_CLIENT_ID + PRODUCT_HUNT_CLIENT_SECRET — see .env.example.",
      );
    }
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
    .map(mapScrapedPost)
    .filter((x): x is FetchedTrendingItem => x !== null);

  return { source: "PRODUCT_HUNT", items };
}

export async function fetchProductHunt(): Promise<FetchResult> {
  const token = env.PRODUCT_HUNT_TOKEN?.trim();
  const clientId = env.PRODUCT_HUNT_CLIENT_ID?.trim();
  const clientSecret = env.PRODUCT_HUNT_CLIENT_SECRET?.trim();

  let bearer: string | undefined;
  if (token) {
    bearer = token;
  } else if (clientId && clientSecret) {
    bearer = await fetchProductHuntAccessToken(clientId, clientSecret);
  }

  if (bearer) {
    return fetchProductHuntGraphQL(bearer);
  }
  return fetchProductHuntScrape();
}
