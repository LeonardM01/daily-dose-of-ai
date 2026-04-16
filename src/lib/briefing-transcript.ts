export function getDisplayTranscript(
  transcript: string | null | undefined,
  script: string | null | undefined,
): string {
  return normalizeTranscriptValue(transcript) ?? normalizeTranscriptValue(script) ?? "";
}

function normalizeTranscriptValue(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = stripCodeFences(value.trim());
  if (!trimmed) return null;

  const parsed = tryParseJson(trimmed);
  if (parsed && typeof parsed === "object") {
    if ("transcript" in parsed && typeof parsed.transcript === "string") {
      return parsed.transcript.trim();
    }

    if ("script" in parsed && typeof parsed.script === "string") {
      return parsed.script.trim();
    }
  }

  if (typeof parsed === "string") {
    return parsed.trim();
  }

  return trimmed;
}

function tryParseJson(value: string): unknown {
  const candidate = extractJsonObject(value) ?? value;
  if (!looksLikeJson(candidate)) return null;

  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function looksLikeJson(value: string): boolean {
  return (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith('"') && value.endsWith('"'))
  );
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
