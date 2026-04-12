export function getDisplayTranscript(
  transcript: string | null | undefined,
  script: string | null | undefined,
): string {
  return normalizeTranscriptValue(transcript) ?? normalizeTranscriptValue(script) ?? "";
}

function normalizeTranscriptValue(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
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
  if (!looksLikeJson(value)) return null;

  try {
    return JSON.parse(value) as unknown;
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
