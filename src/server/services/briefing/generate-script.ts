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

const TARGET_SCRIPT_MAX_CHARS = 15000;

export const BRIEFING_TRANSCRIPT_STRUCTURE_RULES = `Story count: the input has exactly three sections — GitHub movers (3 items), Hacker News (4 items), then an AI editorial roundup (7 items: 3 Medium, 2 dev.to, 2 TechCrunch). Cover every item once, in that order. If an item is weak, still give it one tight sentence pair rather than skipping it.

Structure:
1) GitHub Movers — three repos only. Keep this segment to roughly the first 20% of the total runtime (fast, punchy). Still: one sentence what happened, one sentence why a dev cares per repo.
2) What developers are reading — four Hacker News stories, same two-sentence shape.
3) AI editorial roundup — seven stories in order: the three Medium pieces, then two dev.to, then two TechCrunch. Same two-sentence shape per story.

Per-story word cap: about 55–70 words — punchy, not thorough.
Total target: about 1,350 to 1,550 words (~9–11 minutes at 140 wpm). The plain transcript MUST stay under ${TARGET_SCRIPT_MAX_CHARS} characters total.`;

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

  const transcriptPrompt = `You write the script for "Daily Dose of AI", a short daily audio briefing for developers.
Date for this episode: ${dateLabel}

Voice: You are a knowledgeable dev friend catching the listener up over coffee. Contractions always. Short sentences. Asides welcome. First-person opinion allowed if directly supported by the source. Not a news anchor — a smart friend who actually read the stuff.

Example of the target voice (do NOT copy — just match the register):
"Okay so Anthropic dropped Claude 3.7 yesterday and honestly the headline stat is wild — 700 tokens a second on Sonnet. That's fast enough that streaming barely feels like streaming anymore. The thing I keep coming back to is the new extended thinking mode: it's not just more compute, it's a different kind of reasoning trace. If you're building agents, this changes the math on when to burn tokens."

${BRIEFING_TRANSCRIPT_STRUCTURE_RULES}

Rules:
- Open with one casual sentence that includes the date. Not "Welcome to" — just dive in.
- Cover stories in the order given. The list is grouped: GitHub first, then Hacker News, then Medium → dev.to → TechCrunch for the editorial block — do not reorder.
- For each story: one sentence of what happened, one sentence of why a dev cares. Clip the rest.
- Use the "note" field as context for why the story ranked — do not read it aloud.
- Mention the source by name naturally ("Hacker News is buzzing about…", "Anthropic just posted…").
- Contractions required. Avoid: utilize, leverage, delve, groundbreaking, revolutionary, robust, seamlessly, ecosystem, paradigm, showcase, facilitate, demonstrate, notably, it's worth noting, in conclusion.
- No invented facts. If detail is missing, say less.
- End with one casual sign-off sentence. No "thank you for listening" — just wrap it.
- No stage directions, no bullet points, no markdown, no URLs spoken letter-by-letter.
- Never put words in quotation marks. Rephrase to avoid quoting — the text-to-speech engine reads quote characters aloud as "open quotation" and "close quotation".
- Return ONLY the plain spoken transcript text. No JSON. No SSML. No markdown.

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
- NEVER use <say-as interpret-as="characters"> on project names, repository names, product names, or tech terms (ChatGPT, LangChain, LlamaIndex, GitHub, etc.). The TTS engine pronounces these correctly on its own. Reserve <say-as interpret-as="characters"> only for isolated single letters.
- If a word needs a specific pronunciation, use <sub alias="..."> instead of <say-as interpret-as="characters">.
- Remove ALL quotation marks (" “ ”) from the text content. Do not include any quotation mark characters — the TTS engine reads them aloud as "open quotation" and "close quotation". Rephrase if needed.

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

export function sanitizeSsmlForTts(ssml: string): string {
  let result = ssml;

  result = result.replace(
    /<say-as\s+interpret-as=["']characters["']\s*>([\s\S]*?)<\/say-as>/gi,
    (_match, content: string) => content.trim(),
  );

  result = result.replace(/>([^<]+)</g, (_match, text: string) => {
    const cleaned = text
      .replace(/&quot;/g, "")
      .replace(/[“”"]/g, "");
    return `>${cleaned}<`;
  });

  return result;
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

  return { ssml: sanitizeSsmlForTts(normalized), usedFallback: false };
}

export function buildFallbackSsml(transcript: string): string {
  const withoutQuotes = transcript.replace(/[“”"]/g, "");
  const escaped = escapeXml(withoutQuotes);
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
