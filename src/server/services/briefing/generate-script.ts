import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL = "gemini-2.5-flash";

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

const TARGET_SCRIPT_MAX_CHARS = 14000;

export async function generateBriefingScript(
  apiKey: string,
  stories: StoryInput[],
  dateLabel: string,
): Promise<{
  title: string;
  script: string;
  ssml: string;
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

  const payload = stories.map((s) => ({
    title: s.title,
    url: s.url,
    source: s.sourceName,
    sources: s.sourceNames,
    note: s.reason,
    excerpt: (s.excerpt ?? "").slice(0, 1200),
    corroboratingCoverage: s.supportingLinks.slice(0, 5),
  }));

  const prompt = `You write scripts for a thorough daily tech/AI news audio briefing called "Daily Dose of AI" and you also prepare production-safe SSML for Google Cloud Text-to-Speech Chirp 3 HD.
Date for this episode: ${dateLabel}

Write a single continuous script for the host to read aloud. Target length is 6.5 to 7.5 minutes when read at a moderate pace. Aim for roughly 1400 to 1800 words. The plain transcript MUST stay under ${TARGET_SCRIPT_MAX_CHARS} characters total.

Return ONLY valid JSON with this exact shape:
{
  "transcript": "plain text transcript with no SSML tags",
  "ssml": "<speak>...</speak>"
}

Rules:
- Start with a 1-2 sentence welcome that includes the date.
- Cover the stories in order of global importance.
- Cover at least 12 stories when enough material is provided.
- Spend 3-5 sentences on each major story, and 2-3 sentences on smaller but still relevant stories.
- For each story: give context, what happened, and why it matters; mention the outlet or primary source by name.
- If a story has corroborating coverage from multiple outlets, mention that briefly in one sentence, for example "covered by Anthropic and TechCrunch" or "discussed on Hacker News and reported by Anthropic."
- Include brief transitions so the episode feels like a coherent morning briefing instead of a list.
- Do not invent facts beyond the excerpts; if detail is missing, speak generally.
- Prefer completeness over punchiness; do not end early if there are still important stories to cover.
- Do not produce a short summary. This should feel like a full morning rundown with substantially more detail than a headline recap.
- End with a brief sign-off.
- No stage directions, no bullet points, no markdown, no URLs spoken letter-by-letter.

SSML requirements for Chirp 3 HD:
- The SSML must be well-formed and wrapped in a single <speak> root.
- Use ONLY this safe subset of tags:
  - <speak>
  - <p>
  - <s>
  - <break time="...ms"/>
  - <say-as interpret-as="characters|ordinal|cardinal|date|time">
  - <sub alias="...">
  - <prosody rate="slow|medium|fast" pitch="low|medium|high" volume="soft|medium|loud">
- Do NOT use any other SSML tags.
- Specifically DO NOT use: <audio>, <voice>, <lang>, <emphasis>, <mark>, <par>, <seq>.
- Use <break> sparingly to create natural pacing around section transitions or after especially important items.
- Use <prosody> only on short spans to lightly vary delivery. Do not wrap entire paragraphs in extreme prosody.
- Use <say-as> only where it clearly improves pronunciation, such as abbreviations, dates, or acronyms.
- The transcript field must stay plain text, and the ssml field must contain the expressive version of the same spoken content.

Stories JSON:
${JSON.stringify(payload)}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const usage = result.response.usageMetadata;
  const tokensInput = usage?.promptTokenCount ?? 0;
  const tokensOutput = usage?.candidatesTokenCount ?? 0;

  const title = `Daily briefing — ${dateLabel}`;
  const parsed = parseJsonFromModel(text) as {
    transcript?: string;
    ssml?: string;
  };

  let script = (parsed.transcript ?? "").trim();
  if (!script) {
    throw new Error("Gemini script generation returned no transcript");
  }
  if (script.length > TARGET_SCRIPT_MAX_CHARS) {
    script = script.slice(0, TARGET_SCRIPT_MAX_CHARS - 3) + "...";
  }

  const ssml = sanitizeSsml(parsed.ssml, script);

  return { title, script, ssml, tokensInput, tokensOutput };
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
    throw new Error("Gemini script generation returned no JSON");
  }

  throw new Error("Gemini script generation returned invalid JSON");
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

function sanitizeSsml(ssml: string | undefined, transcript: string): string {
  if (!ssml) {
    return buildFallbackSsml(transcript);
  }

  let normalized = ssml.trim();
  normalized = normalized.replace(/```(?:xml)?/gi, "").replace(/```/g, "").trim();

  const hasSpeakRoot =
    normalized.startsWith("<speak>") && normalized.endsWith("</speak>");
  if (!hasSpeakRoot) {
    return buildFallbackSsml(transcript);
  }

  const forbiddenTags = [
    "audio",
    "voice",
    "lang",
    "emphasis",
    "mark",
    "par",
    "seq",
  ];
  for (const tag of forbiddenTags) {
    const re = new RegExp(`<\\/?\\s*${tag}\\b`, "i");
    if (re.test(normalized)) {
      return buildFallbackSsml(transcript);
    }
  }

  return normalized;
}

function buildFallbackSsml(transcript: string): string {
  const escaped = escapeXml(transcript);
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const body =
    paragraphs.length > 0
      ? paragraphs
          .map((paragraph) => {
            const sentences = paragraph
              .split(/(?<=[.!?])\s+/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => `<s>${s}</s>`)
              .join("");
            return `<p>${sentences}</p>`;
          })
          .join('<break time="500ms"/>')
      : `<p><s>${escaped}</s></p>`;

  return `<speak>${body}</speak>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
