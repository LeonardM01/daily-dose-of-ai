"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  type BriefingTrack,
  useBriefingAudio,
} from "~/app/_components/briefing-audio-provider";
import { Icon } from "~/app/_components/icon";
import { useListeningProgress } from "~/app/_components/use-listening-progress";
import { getDisplayTranscript } from "~/lib/briefing-transcript";
import { getSafeHttpUrl } from "~/lib/safe-external-url";
import { api } from "~/trpc/react";

/* ------------------------------------------------------------------ */
/*  Idle card (not yet playing) – shown inline on dashboard / detail  */
/* ------------------------------------------------------------------ */

export function BriefingAudioPlayerSlot({
  track,
  className = "",
}: {
  track: BriefingTrack;
  className?: string;
}) {
  const { currentTrack, playTrack, showInlinePlayer, hideInlinePlayer } =
    useBriefingAudio();
  const router = useRouter();

  const isActive = currentTrack?.id === track.id;

  useEffect(() => {
    if (!isActive) return;
    showInlinePlayer(track.id);
    return () => hideInlinePlayer(track.id);
  }, [hideInlinePlayer, isActive, showInlinePlayer, track.id]);

  if (isActive) {
    return (
      <section
        className={`overflow-hidden rounded-[28px] border border-violet-500/40 bg-neutral-950 text-white shadow-2xl ${className}`.trim()}
      >
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.38),_transparent_34%),linear-gradient(135deg,rgba(23,23,23,1),rgba(10,10,10,1))] px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-20" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-violet-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
                Now playing
              </p>
              <p className="mt-1 truncate font-semibold">{track.title}</p>
            </div>
            <p className="shrink-0 text-sm text-neutral-400">
              Controls in the bottom bar
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      role="button"
      tabIndex={0}
      onClick={() => router.push(track.detailHref)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(track.detailHref);
        }
      }}
      className={`cursor-pointer overflow-hidden rounded-[28px] border border-neutral-800 bg-neutral-950 text-white shadow-2xl transition hover:border-neutral-700 ${className}`.trim()}
    >
      <div className="bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.35),_transparent_40%),linear-gradient(135deg,rgba(23,23,23,1),rgba(10,10,10,1))] p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
              Daily briefing
            </p>
            <h3 className="mt-3 text-xl font-semibold tracking-tight">
              {track.title}
            </h3>
            <p className="mt-2 text-sm text-neutral-300">
              {track.publishedAtLabel}
              {track.durationSeconds != null &&
                ` • ${formatTime(track.durationSeconds)}`}
            </p>
            <p className="mt-3 max-w-lg text-sm text-neutral-400">
              Press play to listen, or tap the card to view transcript &amp;
              sources.
            </p>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              playTrack(track);
            }}
            className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-5 py-3 font-medium text-neutral-950 transition hover:bg-neutral-200"
          >
            <Icon name="play" className="h-4 w-4" />
            Play briefing
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Persistent bottom bar player (Spotify-style)                      */
/* ------------------------------------------------------------------ */

export function PlayerBottomSpacer() {
  const { currentTrack } = useBriefingAudio();
  if (!currentTrack) return null;
  return <div className="h-16" />;
}

export function PersistentBriefingMiniPlayer() {
  const { currentTrack } = useBriefingAudio();

  if (!currentTrack) return null;

  return <BottomBarPlayer />;
}

function BottomBarPlayer() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    togglePlay,
    seekTo,
    seekBy,
    setVolume,
    toggleMute,
    closeTrack,
  } = useBriefingAudio();

  const [expanded, setExpanded] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const volumeRef = useRef<HTMLDivElement>(null);
  const progressTrackRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  useEffect(() => {
    if (!showVolume) return;
    const onClick = (e: MouseEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) {
        setShowVolume(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showVolume]);

  useEffect(() => {
    if (expanded) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [expanded]);

  const displayDuration =
    duration > 0 ? duration : (currentTrack?.durationSeconds ?? 0);
  const safeDuration = Math.max(displayDuration, 1);
  const progressPercent = Math.min((currentTime / safeDuration) * 100, 100);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const track = progressTrackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      seekTo(ratio * safeDuration);
    },
    [safeDuration, seekTo],
  );

  if (!currentTrack) return null;

  if (expanded) {
    return (
      <ExpandedPlayer
        onCollapse={() => setExpanded(false)}
        safeDuration={safeDuration}
      />
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50">
      <div
        ref={progressTrackRef}
        className="relative h-4 cursor-pointer touch-none bg-neutral-900/95"
        onPointerDown={(e) => {
          setIsScrubbing(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!isScrubbing) return;
          seekFromClientX(e.clientX);
        }}
        onPointerUp={(e) => {
          setIsScrubbing(false);
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={(e) => {
          setIsScrubbing(false);
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        role="slider"
        aria-label="Seek playback position"
        aria-valuemin={0}
        aria-valuemax={safeDuration}
        aria-valuenow={Math.min(currentTime, safeDuration)}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-neutral-800">
          <div
            className={`h-full bg-violet-500 ${isScrubbing ? "" : "transition-[width] duration-150"}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="border-t border-neutral-800 bg-neutral-950/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate text-sm font-semibold text-white">
              {currentTrack.title}
            </p>
            <p className="mt-0.5 text-xs text-neutral-400">
              {formatTime(currentTime)} / {formatTime(displayDuration)}
            </p>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => seekBy(-10)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Rewind 10 seconds"
            >
              <Icon name="back" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-950 transition hover:bg-neutral-200"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Icon name="pause" className="h-4 w-4" />
              ) : (
                <Icon name="play" className="ml-0.5 h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => seekBy(10)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Skip forward 10 seconds"
            >
              <Icon name="forward" className="h-4 w-4" />
            </button>
          </div>

          <div className="relative hidden sm:block" ref={volumeRef}>
            <button
              type="button"
              onClick={() => setShowVolume((s) => !s)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Volume"
            >
              <Icon name={isMuted || volume === 0 ? "volume-muted" : "volume"} className="h-4 w-4" />
            </button>
            {showVolume && (
              <div className="absolute bottom-full right-0 mb-2 flex w-10 flex-col items-center rounded-xl border border-neutral-700 bg-neutral-900 px-2 py-4 shadow-xl">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="h-24 w-1.5 cursor-pointer appearance-none rounded-full bg-white/15 accent-violet-500 [writing-mode:vertical-lr] [direction:rtl]"
                  aria-label="Adjust volume"
                />
                <button
                  type="button"
                  onClick={toggleMute}
                  className="mt-2 text-xs text-neutral-400 hover:text-white"
                >
                  {isMuted ? "On" : "Off"}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Expand player"
          >
            <Icon name="expand" className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={closeTrack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-white/10 hover:text-white"
            aria-label="Close player"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Expanded fullscreen player with transcript & sources              */
/* ------------------------------------------------------------------ */

function ExpandedPlayer({
  onCollapse,
  safeDuration,
}: {
  onCollapse: () => void;
  safeDuration: number;
}) {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    togglePlay,
    seekTo,
    seekBy,
    setVolume,
    toggleMute,
  } = useBriefingAudio();

  const { data: briefingDetail } = api.briefing.byId.useQuery(
    { id: currentTrack?.id ?? "" },
    { enabled: !!currentTrack?.id },
  );

  if (!currentTrack) return null;

  const displayDuration =
    duration > 0 ? duration : (currentTrack.durationSeconds ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onCollapse}
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-neutral-400 transition hover:bg-white/10 hover:text-white"
        >
          <Icon name="collapse" className="h-4 w-4" />
          Minimize
        </button>
        <p className="text-sm font-medium text-neutral-300">Now playing</p>
        <div className="w-20" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
              Daily briefing
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {currentTrack.title}
            </h2>
            <p className="mt-2 text-sm text-neutral-400">
              {currentTrack.publishedAtLabel}
            </p>
          </div>

          <div className="mt-8">
            <input
              type="range"
              min={0}
              max={safeDuration}
              step={1}
              value={Math.min(currentTime, safeDuration)}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-violet-500"
              aria-label="Seek"
            />
            <div className="mt-2 flex justify-between text-xs text-neutral-500">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(displayDuration)}</span>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => seekBy(-10)}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/10"
              aria-label="Rewind 10 seconds"
            >
              <Icon name="back" className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white text-neutral-950 transition hover:bg-neutral-200"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Icon name="pause" className="h-6 w-6" />
              ) : (
                <Icon name="play" className="ml-1 h-6 w-6" />
              )}
            </button>
            <button
              type="button"
              onClick={() => seekBy(10)}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/10"
              aria-label="Skip forward 10 seconds"
            >
              <Icon name="forward" className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <Icon name={isMuted || volume === 0 ? "volume-muted" : "volume"} className="h-4 w-4 text-neutral-500" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
              aria-label="Volume"
            />
            <button
              type="button"
              onClick={toggleMute}
              className="text-xs text-neutral-500 hover:text-white"
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
          </div>

          {briefingDetail && (
            <>
              <section className="mt-12 border-t border-neutral-800 pt-8">
                <h3 className="text-lg font-semibold">Transcript</h3>
                <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
                  {getDisplayTranscript(
                    briefingDetail.transcript,
                    briefingDetail.script,
                  )}
                </div>
              </section>

              {briefingDetail.sources.length > 0 && (
                <section className="mt-10 border-t border-neutral-800 pt-8">
                  <h3 className="text-lg font-semibold">Sources</h3>
                  <ul className="mt-4 space-y-3">
                    {briefingDetail.sources.map((s) => {
                      const safeHref = getSafeHttpUrl(s.article.url);
                      return (
                        <li key={s.id}>
                          {safeHref ? (
                            <a
                              href={safeHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-violet-400 hover:underline"
                            >
                              {s.article.title}
                            </a>
                          ) : (
                            <span className="text-neutral-200">
                              {s.article.title}
                              {s.article.url ? (
                                <span className="mt-1 block break-all text-xs text-neutral-500">
                                  {s.article.url}
                                </span>
                              ) : null}
                            </span>
                          )}
                          <span className="ml-1 text-sm text-neutral-500">
                            — {s.article.sourceName}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </>
          )}

          {!briefingDetail && (
            <p className="mt-12 text-center text-neutral-500">
              Loading transcript…
            </p>
          )}
        </div>

        <div className="h-24" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  List item for the "Previous briefings" section                    */
/* ------------------------------------------------------------------ */

type BriefingListItemProps = {
  briefing: {
    id: string;
    title: string;
    audioUrl: string | null;
    detailHref: string;
    briefingDate: Date;
    durationSeconds: number | null;
    status: string;
  };
};

export function BriefingListItem({ briefing }: BriefingListItemProps) {
  const { currentTrack, isPlaying, playTrack, togglePlay, currentTime, duration } =
    useBriefingAudio();
  const { getProgressPercent, isCompleted } = useListeningProgress();
  const router = useRouter();

  const isActive = currentTrack?.id === briefing.id;
  const completed = isCompleted(briefing.id);
  const savedPercent = getProgressPercent(briefing.id);
  const livePercent =
    isActive && duration > 0 ? Math.min(currentTime / duration, 1) : savedPercent;
  const hasProgress = livePercent > 0.01 && !completed;

  const dateLabel = briefing.briefingDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  const dayOfMonthLabel = briefing.briefingDate.toLocaleDateString(undefined, {
    day: "numeric",
  });

  const dayLabel = briefing.briefingDate.toLocaleDateString(undefined, {
    weekday: "short",
  });

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActive) {
      togglePlay();
      return;
    }
    if (!briefing.audioUrl) return;
    playTrack({
      id: briefing.id,
      title: briefing.title,
      audioUrl: briefing.audioUrl,
      detailHref: briefing.detailHref,
      publishedAtLabel: briefing.briefingDate.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      durationSeconds: briefing.durationSeconds,
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(briefing.detailHref)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(briefing.detailHref);
        }
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border transition ${
        isActive
          ? "border-violet-500/50 bg-violet-950/30 dark:bg-violet-950/20"
          : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
      }`}
    >
      {(hasProgress || (isActive && duration > 0)) && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-neutral-200 dark:bg-neutral-800">
          <div
            className={`h-full transition-[width] ${isActive ? "bg-violet-500" : "bg-violet-400/60"}`}
            style={{ width: `${livePercent * 100}%` }}
          />
        </div>
      )}

      <div className="flex items-center gap-4 p-4">
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-neutral-100 text-center dark:bg-neutral-800">
          <span className="text-xs font-medium uppercase leading-none text-neutral-500 dark:text-neutral-400">
            {dayLabel}
          </span>
          <span className="mt-0.5 text-sm font-bold leading-none text-neutral-900 dark:text-neutral-100">
            {dayOfMonthLabel}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-semibold ${isActive ? "text-violet-300" : "text-neutral-900 dark:text-neutral-100"}`}
          >
            {briefing.title}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span>{dateLabel}</span>
            {briefing.durationSeconds != null && (
              <>
                <span className="text-neutral-300 dark:text-neutral-600">·</span>
                <span>{formatTime(briefing.durationSeconds)}</span>
              </>
            )}
            {completed && (
              <>
                <span className="text-neutral-300 dark:text-neutral-600">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Icon name="check" className="h-3 w-3" />
                  Listened
                </span>
              </>
            )}
            {hasProgress && !completed && (
              <>
                <span className="text-neutral-300 dark:text-neutral-600">·</span>
                <span className="text-violet-500 dark:text-violet-400">
                  {Math.round(livePercent * 100)}%
                </span>
              </>
            )}
          </div>
        </div>

        {briefing.audioUrl && (
          <button
            type="button"
            onClick={handlePlay}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
              isActive && isPlaying
                ? "bg-violet-500 text-white hover:bg-violet-600"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            }`}
            aria-label={isActive && isPlaying ? "Pause" : "Play"}
          >
            {isActive && isPlaying ? (
              <Icon name="pause" className="h-4 w-4" />
            ) : (
              <Icon name="play" className="ml-0.5 h-3.5 w-3.5" />
            )}
          </button>
        )}

        <Icon name="chevron-right" className="h-4 w-4 shrink-0 text-neutral-400 transition group-hover:text-neutral-600 dark:text-neutral-500 dark:group-hover:text-neutral-300" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers & Icons                                                   */
/* ------------------------------------------------------------------ */

function formatTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0:00";
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

