"use client";

import {
  BriefingAudioPlayerSlot,
  BriefingListItem,
} from "~/app/_components/briefing-audio-player";
import { api } from "~/trpc/react";

export function BriefingDashboard() {
  const { data: latest, isLoading: loadingLatest } =
    api.briefing.latest.useQuery();
  const { data: list, isLoading: loadingList } = api.briefing.list.useQuery({
    limit: 30,
  });

  const previousBriefings = list?.filter((b) => b.id !== latest?.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Daily Dose of AI</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Your five- to seven-minute audio overview of the biggest tech and AI
          stories.
        </p>
      </header>

      {loadingLatest && <p className="text-neutral-500">Loading…</p>}
      {!loadingLatest && !latest && (
        <p className="text-neutral-600 dark:text-neutral-400">
          No completed briefing yet. The first episode will appear after the
          scheduled generation job runs.
        </p>
      )}
      {latest?.audioUrl && (
        <BriefingAudioPlayerSlot
          track={{
            id: latest.id,
            title: latest.title,
            audioUrl: latest.audioUrl,
            detailHref: `/briefings/${latest.id}`,
            publishedAtLabel: formatLongDate(latest.briefingDate),
            durationSeconds: latest.durationSeconds,
          }}
        />
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">Previous briefings</h2>
        {loadingList && <p className="text-neutral-500">Loading…</p>}
        {!loadingList && !previousBriefings?.length && (
          <p className="text-neutral-600 dark:text-neutral-400">
            No previous briefings yet.
          </p>
        )}
        {previousBriefings && previousBriefings.length > 0 && (
          <div className="grid gap-3">
            {previousBriefings.map((b) => (
              <BriefingListItem
                key={b.id}
                briefing={{
                  id: b.id,
                  title: b.title,
                  audioUrl: b.audioUrl,
                  detailHref: `/briefings/${b.id}`,
                  briefingDate: b.briefingDate,
                  durationSeconds: b.durationSeconds,
                  status: b.status,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
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
