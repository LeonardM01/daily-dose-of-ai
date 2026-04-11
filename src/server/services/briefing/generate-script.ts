import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL = "gemini-2.5-flash-lite";

export type StoryInput = {
  articleId: string;
  reason: string;
  title: string;
  url: string;
  sourceName: string;
  sourceNames: string[];
  articleIds: string[];
  supportingLinks: Array<{
    articleId: string;
    sourceName: string;
    title: string;
    url: string;
  }>;
  excerpt: string | null;
};

const TARGET_SCRIPT_MAX_CHARS = 9000;

export async function generateBriefingScript(
  apiKey: string,
  stories: StoryInput[],
  dateLabel: string,
): Promise<{ title: string; script: string; tokensInput: number; tokensOutput: number }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL });

  const payload = stories.map((s) => ({
    title: s.title,
    url: s.url,
    source: s.sourceName,
    sources: s.sourceNames,
    note: s.reason,
    excerpt: (s.excerpt ?? "").slice(0, 900),
    corroboratingCoverage: s.supportingLinks.slice(0, 5),
  }));

  const prompt = `You write scripts for a thorough daily tech/AI news audio briefing called "Daily Dose of AI".
Date for this episode: ${dateLabel}

Write a single continuous script for the host to read aloud. Target length is 6.5 to 7.5 minutes when read at a moderate pace. Aim for roughly 950 to 1200 words. The script MUST stay under ${TARGET_SCRIPT_MAX_CHARS} characters total.

Rules:
- Start with a 1-2 sentence welcome that includes the date.
- Cover the stories in order of global importance.
- Spend 2-4 sentences on each major story.
- For each story: give context, what happened, and why it matters; mention the outlet or primary source by name.
- If a story has corroborating coverage from multiple outlets, mention that briefly in one sentence, for example "covered by Anthropic and TechCrunch" or "discussed on Hacker News and reported by Anthropic."
- Include brief transitions so the episode feels like a coherent morning briefing instead of a list.
- Do not invent facts beyond the excerpts; if detail is missing, speak generally.
- Prefer completeness over punchiness; do not end early if there are still important stories to cover.
- End with a brief sign-off.
- No stage directions, no bullet points, no markdown, no URLs spoken letter-by-letter.

Stories JSON:
${JSON.stringify(payload)}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const usage = result.response.usageMetadata;
  const tokensInput = usage?.promptTokenCount ?? 0;
  const tokensOutput = usage?.candidatesTokenCount ?? 0;

  const title = `Daily briefing — ${dateLabel}`;

  let script = text;
  if (script.length > TARGET_SCRIPT_MAX_CHARS) {
    script = script.slice(0, TARGET_SCRIPT_MAX_CHARS - 3) + "...";
  }

  return { title, script, tokensInput, tokensOutput };
}
