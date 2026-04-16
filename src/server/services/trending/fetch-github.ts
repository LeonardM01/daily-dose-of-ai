import {
  BROWSER_USER_AGENT,
  FETCH_TIMEOUT_MS,
  stripHtml,
  type FetchResult,
  type FetchedTrendingItem,
} from "./types";

const TRENDING_URL = "https://github.com/trending?since=daily";
const MAX_ITEMS = 10;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseInteger(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

type ParsedRepo = {
  owner: string;
  name: string;
  description: string | null;
  stars: number | null;
  starsToday: number | null;
  language: string | null;
};

function parseTrendingHtml(html: string): ParsedRepo[] {
  const repos: ParsedRepo[] = [];
  const articleRegex = /<article class="Box-row">([\s\S]*?)<\/article>/g;
  let match: RegExpExecArray | null;
  while ((match = articleRegex.exec(html)) !== null) {
    const block = match[1] ?? "";

    const hrefMatch = /<a[^>]+href="\/([^"/]+)\/([^"]+)"[^>]*>/.exec(block);
    if (!hrefMatch) continue;
    const owner = decodeEntities(hrefMatch[1] ?? "").trim();
    const name = decodeEntities(hrefMatch[2] ?? "").trim();
    if (!owner || !name) continue;

    const descMatch = /<p class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(block);
    const description = descMatch?.[1]
      ? stripHtml(descMatch[1]).trim() || null
      : null;

    const langMatch = /<span itemprop="programmingLanguage">([^<]+)<\/span>/.exec(
      block,
    );
    const language = langMatch?.[1]?.trim() ?? null;

    const starMatches =
      /<a[^>]+href="\/[^"]+\/stargazers"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    const stars = starMatches?.[1] ? parseInteger(stripHtml(starMatches[1])) : null;

    const todayMatch =
      /<span class="d-inline-block float-sm-right">([\s\S]*?)<\/span>/.exec(
        block,
      );
    const starsToday = todayMatch?.[1]
      ? parseInteger(stripHtml(todayMatch[1]))
      : null;

    repos.push({ owner, name, description, stars, starsToday, language });
  }
  return repos;
}

export async function fetchGithubTrending(): Promise<FetchResult> {
  const res = await fetch(TRENDING_URL, {
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GitHub Trending ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const repos = parseTrendingHtml(html).slice(0, MAX_ITEMS);

  const items: FetchedTrendingItem[] = repos.map((r) => ({
    source: "GITHUB",
    externalId: `gh:${r.owner}/${r.name}`,
    title: `${r.owner}/${r.name}`,
    url: `https://github.com/${r.owner}/${r.name}`,
    description: r.description,
    score: r.stars,
    commentCount: null,
    author: r.owner,
    subsource: r.language,
    thumbnailUrl: null,
    metadata: {
      starsToday: r.starsToday,
    },
  }));

  return { source: "GITHUB", items };
}
