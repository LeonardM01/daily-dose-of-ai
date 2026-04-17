"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  type BriefingTrack,
  useBriefingAudio,
} from "~/app/_components/briefing-audio-provider";

export type TranscriptSegment = {
  text: string;
  startMs: number;
  endMs: number;
};

type SynchronizedTranscriptProps = {
  track: BriefingTrack;
  segments: TranscriptSegment[] | null;
  fallbackText: string;
};

function findActiveIndex(
  segments: TranscriptSegment[],
  timeMs: number,
): number {
  if (segments.length === 0) return -1;
  const first = segments[0]!;
  if (timeMs < first.startMs) return -1;

  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segments[mid]!;
    if (timeMs < seg.startMs) hi = mid - 1;
    else if (timeMs > seg.endMs) lo = mid + 1;
    else return mid;
  }
  return Math.min(lo, segments.length - 1);
}

export function SynchronizedTranscript({
  track,
  segments,
  fallbackText,
}: SynchronizedTranscriptProps) {
  const { currentTrack, currentTime, duration, seekTo, playTrack } =
    useBriefingAudio();

  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const previousActiveRef = useRef<number>(-1);
  const pendingSeekSecondsRef = useRef<number | null>(null);

  const isActiveTrack = currentTrack?.id === track.id;
  const hasSegments = Array.isArray(segments) && segments.length > 0;

  const timeMs = isActiveTrack ? currentTime * 1000 : 0;
  const activeIndex = useMemo(() => {
    if (!hasSegments || !isActiveTrack) return -1;
    return findActiveIndex(segments, timeMs);
  }, [hasSegments, isActiveTrack, segments, timeMs]);

  useEffect(() => {
    if (!isActiveTrack) return;
    if (pendingSeekSecondsRef.current === null) return;
    if (duration <= 0) return;
    const seconds = pendingSeekSecondsRef.current;
    pendingSeekSecondsRef.current = null;
    seekTo(seconds);
  }, [duration, isActiveTrack, seekTo]);

  useEffect(() => {
    if (activeIndex < 0) return;
    if (activeIndex === previousActiveRef.current) return;
    previousActiveRef.current = activeIndex;

    const node = itemRefs.current[activeIndex];
    if (!node) return;

    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex]);

  const handleJump = useCallback(
    (segmentIndex: number) => {
      if (!hasSegments) return;
      const seg = segments[segmentIndex]!;
      const seconds = seg.startMs / 1000;

      if (!isActiveTrack) {
        pendingSeekSecondsRef.current = seconds;
        playTrack(track);
        return;
      }
      seekTo(seconds);
    },
    [hasSegments, isActiveTrack, playTrack, seekTo, segments, track],
  );

  if (!hasSegments) {
    return (
      <div className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-neutral-800 dark:text-neutral-200">
        {fallbackText}
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[28px] border border-neutral-200 bg-gradient-to-b from-neutral-50 to-white shadow-sm dark:border-neutral-800 dark:from-neutral-900 dark:to-neutral-950">
      <div className="flex items-center gap-3 border-b border-neutral-200/70 bg-white/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 backdrop-blur dark:border-neutral-800/70 dark:bg-neutral-950/60 dark:text-neutral-400">
        <span className="relative flex h-2 w-2">
          {isActiveTrack && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-70" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              isActiveTrack ? "bg-violet-500" : "bg-neutral-300 dark:bg-neutral-700"
            }`}
          />
        </span>
        Transcript · follow along
        <span className="ml-auto text-[10px] font-medium normal-case tracking-normal text-neutral-400">
          Tap a line to jump
        </span>
      </div>

      <ol
        className="relative max-h-[70vh] space-y-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-6 [scrollbar-width:thin] [scrollbar-color:rgba(115_115_115_0.55)_transparent] dark:[scrollbar-color:rgba(82_82_91_0.7)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-400/60 [&::-webkit-scrollbar-thumb]:shadow-inner hover:[&::-webkit-scrollbar-thumb]:bg-neutral-500/80 dark:[&::-webkit-scrollbar-thumb]:bg-neutral-600/90 dark:hover:[&::-webkit-scrollbar-thumb]:bg-neutral-500/90"
        role="list"
      >
        {segments.map((segment, index) => {
          const isActive = index === activeIndex;
          const isPast = activeIndex > -1 && index < activeIndex;

          const baseClasses =
            "min-w-0 flex-1 rounded-2xl px-4 py-2.5 text-left text-lg leading-relaxed transition-[opacity,transform,color,background-color,box-shadow] duration-300 ease-out motion-reduce:transition-none sm:text-xl";

          const stateClasses = isActive
            ? "scale-[1.015] bg-violet-50/80 font-semibold text-neutral-950 opacity-100 shadow-[0_4px_24px_-12px_rgba(139,92,246,0.45)] dark:bg-violet-500/10 dark:text-white"
            : isPast
              ? "opacity-40 hover:opacity-80"
              : "opacity-30 hover:opacity-70";

          return (
            <li
              key={index}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className="flex items-stretch gap-3"
            >
              <div
                className="flex w-1.5 shrink-0 flex-col"
                aria-hidden
              >
                <span
                  className={`min-h-0 flex-1 rounded-r-full transition-colors duration-300 ${
                    isActive
                      ? "bg-violet-500 shadow-[2px_0_12px_-2px_rgba(139,92,246,0.55)]"
                      : "bg-transparent"
                  }`}
                />
              </div>
              <button
                type="button"
                onClick={() => handleJump(index)}
                className={`${baseClasses} ${stateClasses} block w-full cursor-pointer text-neutral-800 dark:text-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950`}
                aria-current={isActive ? "true" : undefined}
              >
                {segment.text}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
