import Link from "next/link";
import { notFound } from "next/navigation";

import { BriefingAudioPlayerSlot } from "~/app/_components/briefing-audio-player";
import {
  SynchronizedTranscript,
  type TranscriptSegment,
} from "~/app/_components/synchronized-transcript";
import { PUBLIC_BRIEFING_FAILURE_MESSAGE } from "~/lib/briefing-messages";
import { getDisplayTranscript } from "~/lib/briefing-transcript";
import { getSafeHttpUrl } from "~/lib/safe-external-url";
import { db } from "~/server/db";

export default async function BriefingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const briefing = await db.dailyBriefing.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      briefingDate: true,
      status: true,
      audioUrl: true,
      durationSeconds: true,
      script: true,
      transcript: true,
      transcriptSegments: true,
      sources: {
        include: {
          article: {
            select: {
              id: true,
              title: true,
              url: true,
              sourceName: true,
            },
          },
        },
      },
    },
  });

  if (!briefing) {
    notFound();
  }

  const transcriptSegments = parseTranscriptSegments(
    briefing.transcriptSegments,
  );
  const fallbackTranscript = getDisplayTranscript(
    briefing.transcript,
    briefing.script,
  );

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/"
        className="text-sm text-violet-600 hover:underline dark:text-violet-400"
      >
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold">{briefing.title}</h1>
      <p className="mt-2 text-neutral-500">
        {formatLongDate(briefing.briefingDate)}
        {briefing.status !== "COMPLETED" && (
          <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            {briefing.status}
          </span>
        )}
      </p>

      {briefing.audioUrl && (
        <BriefingAudioPlayerSlot
          className="mt-8"
          track={{
            id: briefing.id,
            title: briefing.title,
            audioUrl: briefing.audioUrl,
            detailHref: `/briefings/${briefing.id}`,
            publishedAtLabel: formatLongDate(briefing.briefingDate),
            durationSeconds: briefing.durationSeconds,
          }}
        />
      )}

      {briefing.status === "FAILED" && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {PUBLIC_BRIEFING_FAILURE_MESSAGE}
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Transcript</h2>
        {briefing.audioUrl ? (
          <SynchronizedTranscript
            track={{
              id: briefing.id,
              title: briefing.title,
              audioUrl: briefing.audioUrl,
              detailHref: `/briefings/${briefing.id}`,
              publishedAtLabel: formatLongDate(briefing.briefingDate),
              durationSeconds: briefing.durationSeconds,
            }}
            segments={transcriptSegments}
            fallbackText={fallbackTranscript}
          />
        ) : (
          <div className="mt-3 whitespace-pre-wrap text-neutral-800 dark:text-neutral-200">
            {fallbackTranscript}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Sources</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {briefing.sources.map((s) => {
            const safeHref = getSafeHttpUrl(s.article.url);
            return (
              <li key={s.id}>
                {safeHref ? (
                  <a
                    href={safeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-600 hover:underline dark:text-violet-400"
                  >
                    {s.article.title}
                  </a>
                ) : (
                  <span className="text-neutral-800 dark:text-neutral-200">
                    {s.article.title}
                    {s.article.url ? (
                      <span className="block break-all text-xs text-neutral-500">
                        {s.article.url}
                      </span>
                    ) : null}
                  </span>
                )}
                <span className="text-neutral-500">
                  {" "}
                  — {s.article.sourceName}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </article>
  );
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function parseTranscriptSegments(value: unknown): TranscriptSegment[] | null {
  if (!Array.isArray(value)) return null;
  const out: TranscriptSegment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const rec = item as Record<string, unknown>;
    const text = rec.text;
    const startMs = rec.startMs;
    const endMs = rec.endMs;
    if (
      typeof text !== "string" ||
      typeof startMs !== "number" ||
      typeof endMs !== "number"
    ) {
      return null;
    }
    out.push({ text, startMs, endMs });
  }
  return out.length > 0 ? out : null;
}
