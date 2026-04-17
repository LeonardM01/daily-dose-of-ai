 import { GoogleGenerativeAI } from "@google/generative-ai";
 import { buildHumanizerPrompt } from "./humanizer";

 const MODEL = "gemini-2.5-flash";
 const HUMANIZER_MODEL = "gemini-2.5-flash";
 const TTS_SYNC_LIMIT_BYTES = 5000;

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
type PromptStoryPayload = {
  title: string;
  url: string;
  source: string;
  sources: string[];
  note: string;
  excerpt: string;
  corroboratingCoverage: Array<{
    articleId: string;
    sourceName: string;
    title: string;
    url: string;
  }>;
};

export type ScriptAttemptRecorder = (attempt: {
  stage: "SCRIPT_TRANSCRIPT" | "SCRIPT_HUMANIZE" | "SCRIPT_SSML";
  status: "SUCCESS" | "FAILED";
  prompt: string;
  response?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}) => Promise<void> | void;

export async function generateBriefingScript(
  apiKey: string,
  stories: StoryInput[],
  dateLabel: string,
  recordAttempt?: ScriptAttemptRecorder,
): Promise<{
  title: string;
  script: string;
  tokensInput: number;
  tokensOutput: number;
}> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL });

  const payload: PromptStoryPayload[] = stories.map((s) => ({
    title: s.title,
    url: s.url,
    source: s.sourceName,
    sources: s.sourceNames,
    note: s.reason,
    excerpt: (s.excerpt ?? "").slice(0, 1200),
    corroboratingCoverage: s.supportingLinks.slice(0, 5),
  }));

  const transcriptPrompt = `You write scripts for a thorough daily tech/AI news audio briefing called "Daily Dose of AI".
Date for this episode: ${dateLabel}

Write a single continuous script for the host to read aloud. Target length is 6.5 to 7.5 minutes when read at a moderate pace. Aim for roughly 1400 to 1800 words. The plain transcript MUST stay under ${TARGET_SCRIPT_MAX_CHARS} characters total.

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
- Return ONLY the plain spoken transcript text.
- Do not return JSON.
- Do not return SSML.
- Do not use markdown.

Stories JSON:
${JSON.stringify(payload)}`;

  const title = `Daily briefing — ${dateLabel}`;
  const transcriptResult = await generateTranscript(
    model,
    transcriptPrompt,
    recordAttempt,
  );
  const tokensInput = transcriptResult.tokensInput;
  const tokensOutput = transcriptResult.tokensOutput;
  let script = transcriptResult.script;

  if (!script) {
    throw new Error("Gemini script generation returned no transcript");
  }

  if (script.length > TARGET_SCRIPT_MAX_CHARS) {
    script = script.slice(0, TARGET_SCRIPT_MAX_CHARS - 3) + "...";
  }

  return { title, script, tokensInput, tokensOutput };
}

async function generateTranscript(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  prompt: string,
  recordAttempt?: ScriptAttemptRecorder,
): Promise<{ script: string; tokensInput: number; tokensOutput: number }> {
  let rawResponse = "";
  try {
    const result = await model.generateContent(prompt);
    rawResponse = result.response.text();
    const text = cleanTranscriptResponse(rawResponse);
    const usage = result.response.usageMetadata;

    if (!text) {
      throw new Error("Gemini transcript generation returned empty text");
    }

    await recordAttempt?.({
      stage: "SCRIPT_TRANSCRIPT",
      status: "SUCCESS",
      prompt,
      response: rawResponse,
      metadata: {
        tokensInput: usage?.promptTokenCount ?? 0,
        tokensOutput: usage?.candidatesTokenCount ?? 0,
      },
    });

    return {
      script: text,
      tokensInput: usage?.promptTokenCount ?? 0,
      tokensOutput: usage?.candidatesTokenCount ?? 0,
    };
  } catch (error) {
    await recordAttempt?.({
      stage: "SCRIPT_TRANSCRIPT",
      status: "FAILED",
      prompt,
      response: rawResponse || undefined,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function generateBriefingSsml(
  apiKey: string,
  transcript: string,
  dateLabel: string,
  recordAttempt?: ScriptAttemptRecorder,
): Promise<{ ssml: string; tokensInput: number; tokensOutput: number }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL });
  const prompt = buildSsmlPrompt(transcript, dateLabel);
  const transcriptLength = transcript.length;

  let rawResponse = "";
  let tokensInput = 0;
  let tokensOutput = 0;
  try {
    const result = await model.generateContent(prompt);
    rawResponse = result.response.text();
    const usage = result.response.usageMetadata;
    tokensInput = usage?.promptTokenCount ?? 0;
    tokensOutput = usage?.candidatesTokenCount ?? 0;

    const resolved = resolveSsml(rawResponse, transcript);
    const ssmlBytes = Buffer.byteLength(resolved.ssml, "utf8");
    await recordAttempt?.({
      stage: "SCRIPT_SSML",
      status: "SUCCESS",
      prompt,
      response: resolved.ssml,
      metadata: {
        transcriptLength,
        ssmlLength: resolved.ssml.length,
        ssmlBytes,
        exceedsSyncTtsLimit: ssmlBytes > TTS_SYNC_LIMIT_BYTES,
        usedFallback: resolved.usedFallback,
        fallbackReason: resolved.fallbackReason,
        modelResponseLength: rawResponse.length,
        tokensInput,
        tokensOutput,
      },
    });

    return {
      ssml: resolved.ssml,
      tokensInput,
      tokensOutput,
    };
  } catch (error) {
    await recordAttempt?.({
      stage: "SCRIPT_SSML",
      status: "FAILED",
      prompt,
      response: rawResponse || undefined,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        transcriptLength,
        tokensInput,
        tokensOutput,
      },
    });

    const ssml = buildFallbackSsml(transcript);
    const ssmlBytes = Buffer.byteLength(ssml, "utf8");
    await recordAttempt?.({
      stage: "SCRIPT_SSML",
      status: "SUCCESS",
      prompt,
      response: ssml,
      metadata: {
        transcriptLength,
        ssmlLength: ssml.length,
        ssmlBytes,
        exceedsSyncTtsLimit: ssmlBytes > TTS_SYNC_LIMIT_BYTES,
        usedFallback: true,
        fallbackReason: "model_generation_failed",
        tokensInput,
        tokensOutput,
      },
    });

    console.warn("[briefing] falling back to deterministic SSML generation", {
      error: error instanceof Error ? error.message : String(error),
    });

    return { ssml, tokensInput, tokensOutput };
  }
}

export async function humanizeTranscript(
  apiKey: string,
  transcript: string,
  recordAttempt?: ScriptAttemptRecorder,
): Promise<{ transcript: string; tokensInput: number; tokensOutput: number }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: HUMANIZER_MODEL });
  const prompt = buildHumanizerPrompt(transcript);
  const originalLength = transcript.length;

  try {
    const result = await model.generateContent(prompt);
    const humanized = result.response.text().trim();
    const usage = result.response.usageMetadata;
    const tokensInput = usage?.promptTokenCount ?? 0;
    const tokensOutput = usage?.candidatesTokenCount ?? 0;

    await recordAttempt?.({
      stage: "SCRIPT_HUMANIZE",
      status: "SUCCESS",
      prompt,
      response: humanized,
      metadata: {
        originalLength,
        humanizedLength: humanized.length,
        lengthDelta: humanized.length - originalLength,
        tokensInput,
        tokensOutput,
      },
    });

    return { transcript: humanized, tokensInput, tokensOutput };
  } catch (error) {
    await recordAttempt?.({
      stage: "SCRIPT_HUMANIZE",
      status: "FAILED",
      prompt,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        originalLength,
      },
    });

    console.warn("[briefing] humanizer failed, using raw transcript", {
      error: error instanceof Error ? error.message : String(error),
    });

    return { transcript, tokensInput: 0, tokensOutput: 0 };
  }
}

function buildSsmlPrompt(transcript: string, dateLabel: string): string {
  return `Convert this completed Daily Dose of AI transcript into production-safe SSML for Google Cloud Text-to-Speech Chirp 3 HD.
Date for this episode: ${dateLabel}

Return ONLY SSML wrapped in a single <speak> root. Do not return JSON. Do not return markdown. Do not add commentary before or after the SSML.

Requirements:
- Preserve the meaning and ordering of the transcript.
- Keep the wording as close to the transcript as possible.
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
- Use <break> sparingly at section transitions.
- Use <prosody> only on short spans, not entire paragraphs.
- Use <say-as> only where it clearly improves pronunciation.

Transcript:
${transcript}`;
}

function cleanTranscriptResponse(text: string): string {
  let normalized = stripCodeFences(text.trim());
  normalized = normalized.trim();

  const parsed = tryParseStructuredTranscript(normalized);
  if (parsed) {
    return parsed;
  }

  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    try {
      normalized = JSON.parse(normalized) as string;
    } catch {
      // Keep original text if it is not a valid JSON string literal.
    }
  }

  return normalized.trim();
}

function tryParseStructuredTranscript(text: string): string | null {
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      transcript?: unknown;
      script?: unknown;
    };
    if (typeof parsed.transcript === "string") {
      return parsed.transcript.trim();
    }
    if (typeof parsed.script === "string") {
      return parsed.script.trim();
    }
  } catch {
    return null;
  }

  return null;
}

function stripCodeFences(text: string): string {
  const fenced = /```(?:json|text|markdown)?\s*([\s\S]*?)```/i.exec(text);
  return fenced?.[1]?.trim() ?? text;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1);
}

function resolveSsml(
  ssml: string | undefined,
  transcript: string,
): { ssml: string; usedFallback: boolean; fallbackReason?: string } {
  if (!ssml) {
    return {
      ssml: buildFallbackSsml(transcript),
      usedFallback: true,
      fallbackReason: "empty_ssml_response",
    };
  }

  let normalized = ssml.trim();
  normalized = normalized.replace(/```(?:xml)?/gi, "").replace(/```/g, "").trim();

  const hasSpeakRoot =
    normalized.startsWith("<speak>") && normalized.endsWith("</speak>");
  if (!hasSpeakRoot) {
    return {
      ssml: buildFallbackSsml(transcript),
      usedFallback: true,
      fallbackReason: "missing_speak_root",
    };
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
      return {
        ssml: buildFallbackSsml(transcript),
        usedFallback: true,
        fallbackReason: `forbidden_tag_${tag}`,
      };
    }
  }

  return { ssml: normalized, usedFallback: false };
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
