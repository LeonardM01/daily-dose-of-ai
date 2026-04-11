"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

const STORAGE_KEY = "ddoai-listening-progress";
const COMPLETED_THRESHOLD = 0.95;

export type TrackProgress = {
  currentTime: number;
  duration: number;
  updatedAt: number;
};

type ProgressMap = Record<string, TrackProgress>;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function readMap(): ProgressMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: ProgressMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota exceeded -- ignore */
  }
  emit();
}

function getSnapshot() {
  if (typeof window === "undefined") return "{}";
  return localStorage.getItem(STORAGE_KEY) ?? "{}";
}

function getServerSnapshot() {
  return "{}";
}

function subscribe(callback: () => void) {
  listeners.add(callback);

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) emit();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function useListeningProgress() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const mapRef = useRef<ProgressMap>({});

  useEffect(() => {
    try {
      mapRef.current = JSON.parse(raw) as ProgressMap;
    } catch {
      mapRef.current = {};
    }
  }, [raw]);

  const saveProgress = useCallback(
    (trackId: string, currentTime: number, duration: number) => {
      if (!trackId || duration <= 0) return;
      const map = readMap();
      const existing = map[trackId];
      if (
        existing &&
        Math.abs(existing.currentTime - currentTime) < 2 &&
        Math.abs(existing.duration - duration) < 1
      ) {
        return;
      }
      map[trackId] = { currentTime, duration, updatedAt: Date.now() };
      writeMap(map);
    },
    [],
  );

  const getProgress = useCallback(
    (trackId: string): TrackProgress | null => {
      try {
        const map = JSON.parse(raw) as ProgressMap;
        return map[trackId] ?? null;
      } catch {
        return null;
      }
    },
    [raw],
  );

  const getProgressPercent = useCallback(
    (trackId: string): number => {
      const p = getProgress(trackId);
      if (!p || p.duration <= 0) return 0;
      return Math.min(p.currentTime / p.duration, 1);
    },
    [getProgress],
  );

  const isCompleted = useCallback(
    (trackId: string): boolean => {
      return getProgressPercent(trackId) >= COMPLETED_THRESHOLD;
    },
    [getProgressPercent],
  );

  return { saveProgress, getProgress, getProgressPercent, isCompleted };
}
