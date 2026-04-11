"use client";

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useListeningProgress } from "~/app/_components/use-listening-progress";

export type BriefingTrack = {
  id: string;
  title: string;
  audioUrl: string;
  detailHref: string;
  publishedAtLabel: string;
  durationSeconds?: number | null;
};

type BriefingAudioContextValue = {
  currentTrack: BriefingTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  inlineTrackId: string | null;
  playTrack: (track: BriefingTrack) => void;
  togglePlay: () => void;
  seekTo: (time: number) => void;
  seekBy: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  closeTrack: () => void;
  showInlinePlayer: (trackId: string) => void;
  hideInlinePlayer: (trackId: string) => void;
};

const BriefingAudioContext = createContext<BriefingAudioContextValue | null>(
  null,
);

export function BriefingAudioProvider({
  children,
}: {
  children: ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoplayRequestedRef = useRef(false);
  const lastNonZeroVolumeRef = useRef(1);
  const { saveProgress, getProgress } = useListeningProgress();
  const lastSaveRef = useRef(0);

  const [currentTrack, setCurrentTrack] = useState<BriefingTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [inlineTrackId, setInlineTrackId] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const syncFromAudio = () => {
      setCurrentTime(audio.currentTime || 0);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setIsPlaying(!audio.paused && !audio.ended);
      setVolumeState(audio.volume);
      setIsMuted(audio.muted || audio.volume === 0);
      if (audio.volume > 0) {
        lastNonZeroVolumeRef.current = audio.volume;
      }

      const trackId = audio.dataset.trackId;
      if (
        trackId &&
        audio.currentTime > 0 &&
        Number.isFinite(audio.duration) &&
        Date.now() - lastSaveRef.current > 3000
      ) {
        lastSaveRef.current = Date.now();
        saveProgress(trackId, audio.currentTime, audio.duration);
      }
    };

    syncFromAudio();

    const saveOnPauseOrEnd = () => {
      const trackId = audio.dataset.trackId;
      if (trackId && audio.currentTime > 0 && Number.isFinite(audio.duration)) {
        saveProgress(trackId, audio.currentTime, audio.duration);
      }
    };

    audio.addEventListener("timeupdate", syncFromAudio);
    audio.addEventListener("loadedmetadata", syncFromAudio);
    audio.addEventListener("durationchange", syncFromAudio);
    audio.addEventListener("play", syncFromAudio);
    audio.addEventListener("pause", syncFromAudio);
    audio.addEventListener("volumechange", syncFromAudio);
    audio.addEventListener("ended", syncFromAudio);
    audio.addEventListener("pause", saveOnPauseOrEnd);
    audio.addEventListener("ended", saveOnPauseOrEnd);

    return () => {
      audio.removeEventListener("timeupdate", syncFromAudio);
      audio.removeEventListener("loadedmetadata", syncFromAudio);
      audio.removeEventListener("durationchange", syncFromAudio);
      audio.removeEventListener("play", syncFromAudio);
      audio.removeEventListener("pause", syncFromAudio);
      audio.removeEventListener("volumechange", syncFromAudio);
      audio.removeEventListener("ended", syncFromAudio);
      audio.removeEventListener("pause", saveOnPauseOrEnd);
      audio.removeEventListener("ended", saveOnPauseOrEnd);
    };
  }, [saveProgress]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!currentTrack) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      return;
    }

    if (audio.dataset.trackId !== currentTrack.id) {
      audio.dataset.trackId = currentTrack.id;
      audio.src = currentTrack.audioUrl;
      audio.load();

      const saved = getProgress(currentTrack.id);
      const resumeTime =
        saved && saved.duration > 0 && saved.currentTime / saved.duration < 0.95
          ? saved.currentTime
          : 0;

      const onCanPlay = () => {
        if (resumeTime > 0) {
          audio.currentTime = resumeTime;
        }
        audio.removeEventListener("canplay", onCanPlay);
      };
      audio.addEventListener("canplay", onCanPlay);

      setCurrentTime(resumeTime);
      setDuration(currentTrack.durationSeconds ?? 0);
    }

    if (autoplayRequestedRef.current) {
      autoplayRequestedRef.current = false;
      void audio.play().catch(() => {
        setIsPlaying(false);
      });
    }
  }, [currentTrack, getProgress]);

  const playTrack = useCallback((track: BriefingTrack) => {
    const audio = audioRef.current;
    if (currentTrack?.id === track.id && audio) {
      if (
        Number.isFinite(audio.duration) &&
        audio.currentTime >= Math.max(audio.duration - 0.25, 0)
      ) {
        audio.currentTime = 0;
      }
      void audio.play().catch(() => {
        setIsPlaying(false);
      });
      return;
    }

    autoplayRequestedRef.current = true;
    setCurrentTrack(track);
    setDuration(track.durationSeconds ?? 0);
  }, [currentTrack?.id]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      return;
    }

    if (audio.paused) {
      void audio.play().catch(() => {
        setIsPlaying(false);
      });
      return;
    }

    audio.pause();
  }, [currentTrack]);

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const nextTime = Math.min(
      Math.max(audio.currentTime + seconds, 0),
      Number.isFinite(audio.duration) ? audio.duration : duration,
    );
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, [duration]);

  const setVolume = useCallback((nextVolume: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const boundedVolume = Math.min(Math.max(nextVolume, 0), 1);
    audio.volume = boundedVolume;
    audio.muted = boundedVolume === 0;
    if (boundedVolume > 0) {
      lastNonZeroVolumeRef.current = boundedVolume;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.muted || audio.volume === 0) {
      audio.muted = false;
      audio.volume = lastNonZeroVolumeRef.current;
      return;
    }

    audio.muted = true;
  }, []);

  const closeTrack = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }

    setCurrentTrack(null);
    setInlineTrackId(null);
  }, []);

  const showInlinePlayer = useCallback((trackId: string) => {
    setInlineTrackId(trackId);
  }, []);

  const hideInlinePlayer = useCallback((trackId: string) => {
    setInlineTrackId((activeTrackId) =>
      activeTrackId === trackId ? null : activeTrackId,
    );
  }, []);

  const value = useMemo<BriefingAudioContextValue>(
    () => ({
      currentTrack,
      isPlaying,
      currentTime,
      duration,
      volume,
      isMuted,
      inlineTrackId,
      playTrack,
      togglePlay,
      seekTo,
      seekBy,
      setVolume,
      toggleMute,
      closeTrack,
      showInlinePlayer,
      hideInlinePlayer,
    }),
    [
      closeTrack,
      currentTime,
      currentTrack,
      duration,
      hideInlinePlayer,
      inlineTrackId,
      isMuted,
      isPlaying,
      playTrack,
      seekBy,
      seekTo,
      setVolume,
      showInlinePlayer,
      toggleMute,
      togglePlay,
      volume,
    ],
  );

  return (
    <BriefingAudioContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" className="hidden" />
    </BriefingAudioContext.Provider>
  );
}

export function useBriefingAudio() {
  const context = useContext(BriefingAudioContext);

  if (!context) {
    throw new Error(
      "useBriefingAudio must be used within a BriefingAudioProvider",
    );
  }

  return context;
}
