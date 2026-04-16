import { db } from "../src/server/db";

type ParsedTranscriptObject = {
  transcript?: unknown;
  script?: unknown;
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const briefings = await db.dailyBriefing.findMany({
    select: {
      id: true,
      briefingDate: true,
      title: true,
      script: true,
      transcript: true,
    },
  });

  let changed = 0;

  for (const briefing of briefings) {
    const normalizedTranscript = extractTranscriptText(briefing.transcript);
    const normalizedScript = extractTranscriptText(briefing.script);
    const nextText = normalizedTranscript ?? normalizedScript;

    if (!nextText) continue;

    const needsUpdate =
      briefing.transcript !== nextText || briefing.script !== nextText;

    if (!needsUpdate) continue;

    changed += 1;

    console.log(
      `${dryRun ? "[dry-run] " : ""}normalize ${briefing.id} ${briefing.briefingDate.toISOString().slice(0, 10)} ${briefing.title}`,
    );

    if (!dryRun) {
      await db.dailyBriefing.update({
        where: { id: briefing.id },
        data: {
          transcript: nextText,
          script: nextText,
        },
      });
    }
  }

  console.log(
    `${dryRun ? "Would normalize" : "Normalized"} ${changed} briefing row${changed === 1 ? "" : "s"}.`,
  );
}

function extractTranscriptText(value: string | null): string | null {
  if (!value) return null;

  const trimmed = stripCodeFences(value.trim());
  if (!trimmed) return null;

  const jsonText = extractJsonObject(trimmed);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as ParsedTranscriptObject;
      if (typeof parsed.transcript === "string" && parsed.transcript.trim()) {
        return parsed.transcript.trim();
      }
      if (typeof parsed.script === "string" && parsed.script.trim()) {
        return parsed.script.trim();
      }
    } catch {
      return null;
    }
  }

  return trimmed;
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
