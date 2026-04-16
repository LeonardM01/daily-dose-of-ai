import { GoogleGenerativeAI } from "@google/generative-ai";

export type ArticleForRank = {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  excerpt: string | null;
};

export type RankedStory = {
  clusterId: string;
  reason: string;
};

export type StoryCluster = {
  id: string;
  articleIds: string[];
  representativeArticleId: string;
  title: string;
  primaryUrl: string;
  excerpt: string | null;
  sourceNames: string[];
  supportingLinks: Array<{
    articleId: string;
    sourceName: string;
    title: string;
    url: string;
  }>;
};

export type RankingAttemptRecorder = (attempt: {
  stage: "RANKING";
  status: "SUCCESS" | "FAILED";
  prompt: string;
  response?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}) => Promise<void> | void;

const MODEL = "gemini-2.5-flash-lite";
const TITLE_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
]);

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title: string): string[] {
  return normalizeTitle(title)
    .split(" ")
    .filter((token) => token.length > 2 && !TITLE_STOPWORDS.has(token));
}

function overlapRatio(a: string[], b: string[]): number {
  const aSet = new Set(a);
  const bSet = new Set(b);
  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) overlap += 1;
  }
  return overlap / Math.max(1, Math.min(aSet.size, bSet.size));
}

function overlapCount(a: string[], b: string[]): number {
  const bSet = new Set(b);
  return [...new Set(a)].filter((token) => bSet.has(token)).length;
}

function shouldClusterTogether(a: ArticleForRank, b: ArticleForRank): boolean {
  const aNorm = normalizeTitle(a.title);
  const bNorm = normalizeTitle(b.title);
  if (!aNorm || !bNorm) return false;
  if (aNorm === bNorm) return true;
  if (
    (aNorm.includes(bNorm) || bNorm.includes(aNorm)) &&
    Math.min(aNorm.length, bNorm.length) >= 24
  ) {
    return true;
  }
  const aTokens = titleTokens(a.title);
  const bTokens = titleTokens(b.title);
  const ratio = overlapRatio(aTokens, bTokens);
  const count = overlapCount(aTokens, bTokens);
  const longTokenMatch = aTokens.some(
    (token) => token.length >= 6 && bTokens.includes(token),
  );
  if (count >= 2 && longTokenMatch) {
    return true;
  }
  return ratio >= 0.72;
}

export function clusterArticles(articles: ArticleForRank[]): StoryCluster[] {
  const clusters: StoryCluster[] = [];

  for (const article of articles) {
    const existing = clusters.find((cluster) => {
      const representative = cluster.supportingLinks[0];
      if (!representative) return false;
      return shouldClusterTogether(article, {
        id: representative.articleId,
        title: representative.title,
        url: representative.url,
        sourceName: representative.sourceName,
        excerpt: cluster.excerpt,
      });
    });

    if (!existing) {
      clusters.push({
        id: article.id,
        articleIds: [article.id],
        representativeArticleId: article.id,
        title: article.title,
        primaryUrl: article.url,
        excerpt: article.excerpt,
        sourceNames: [article.sourceName],
        supportingLinks: [
          {
            articleId: article.id,
            sourceName: article.sourceName,
            title: article.title,
            url: article.url,
          },
        ],
      });
      continue;
    }

    existing.articleIds.push(article.id);
    if (!existing.sourceNames.includes(article.sourceName)) {
      existing.sourceNames.push(article.sourceName);
    }
    existing.supportingLinks.push({
      articleId: article.id,
      sourceName: article.sourceName,
      title: article.title,
      url: article.url,
    });
  }

  return clusters.map((cluster) => ({
    ...cluster,
    sourceNames: [...cluster.sourceNames].sort(),
    supportingLinks: cluster.supportingLinks.slice(0, 6),
  }));
}

export async function rankStoriesWithGemini(
  apiKey: string,
  clusters: StoryCluster[],
  recordAttempt?: RankingAttemptRecorder,
): Promise<{
  ranked: RankedStory[];
  tokensInput: number;
  tokensOutput: number;
}> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const compact = clusters.slice(0, 220).map((cluster) => ({
    clusterId: cluster.id,
    title: cluster.title,
    primaryUrl: cluster.primaryUrl,
    sources: cluster.sourceNames,
    sourceCount: cluster.sourceNames.length,
    excerpt: (cluster.excerpt ?? "").slice(0, 700),
    corroboratingCoverage: cluster.supportingLinks.map((link) => ({
      source: link.sourceName,
      title: link.title,
      url: link.url,
    })),
  }));

  const prompt = `You are selecting the biggest tech and AI industry stories for a daily audio briefing.
Return ONLY valid JSON, no markdown, with this exact shape:
{"top":[{"clusterId":"<clusterId from input>","reason":"<one short sentence why it matters globally>"}]}
Pick 14 to 18 items. Prefer breaking news, major product/policy moves, widely impactful research, and stories with real ecosystem consequences. Include enough strong stories to support a full roughly 7-minute briefing. If multiple sources cover the same story, treat them as one combined story and favor clusters with corroboration and primary-source coverage.
Input story clusters:
${JSON.stringify(compact)}`;

  let text = "";
  try {
    const result = await model.generateContent(prompt);
    text = result.response.text();
    const usage = result.response.usageMetadata;
    const tokensInput = usage?.promptTokenCount ?? 0;
    const tokensOutput =
      usage?.candidatesTokenCount ??
      (usage?.totalTokenCount != null && usage?.promptTokenCount != null
        ? usage.totalTokenCount - usage.promptTokenCount
        : 0);

    const parsed = parseJsonFromModel(text) as { top?: RankedStory[] };
    const top = parsed.top ?? [];

    await recordAttempt?.({
      stage: "RANKING",
      status: "SUCCESS",
      prompt,
      response: text,
      metadata: {
        clusterCount: compact.length,
        tokensInput,
        tokensOutput,
      },
    });

    return {
      ranked: top.filter((t) => t.clusterId && t.reason),
      tokensInput,
      tokensOutput,
    };
  } catch (error) {
    await recordAttempt?.({
      stage: "RANKING",
      status: "FAILED",
      prompt,
      response: text || undefined,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        clusterCount: compact.length,
      },
    });
    throw error;
  }
}

function parseJsonFromModel(text: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fence?.[1]?.trim() ?? text.trim();

  const attempts = [
    candidate,
    extractFirstJsonObject(candidate),
    stripTrailingCommas(extractFirstJsonObject(candidate)),
  ].filter((value): value is string => Boolean(value));

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as unknown;
    } catch {
      // Try the next fallback.
    }
  }

  if (!extractFirstJsonObject(candidate)) {
    throw new Error("Gemini ranking: no JSON in response");
  }

  throw new Error("Gemini ranking returned invalid JSON");
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (!char) continue;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function stripTrailingCommas(text: string | null): string | null {
  if (!text) return null;
  return text.replace(/,\s*([}\]])/g, "$1");
}
