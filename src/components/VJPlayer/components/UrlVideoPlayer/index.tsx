import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlaybackIntent, VJPlayerEvents, VJPlayerInterface } from "../../types";
import { notifyPlaybackStateEvents } from "../../utils";
import styles from "./index.module.css";

export interface UrlVideoPlayerProps {
  active: boolean;
  sourceUrl: string | null;
  playbackIntent: PlaybackIntent;
  onInterfaceReady: (iface: VJPlayerInterface) => void;
  onInterfaceClear?: () => void;
  onSourceLoaded?: () => void;
  onDurationChange?: (duration: number | null) => void;
  onMediaReady?: (timing: { currentTime: number; baseTime: number }) => void;
  events?: Pick<VJPlayerEvents, "onPaused" | "onUnpaused" | "onEnded" | "onMediaReady">;
}

const createVJPlayerInterface = (
  video: HTMLVideoElement,
  isReadyRef: React.MutableRefObject<boolean>
): VJPlayerInterface => ({
  getCurrentTime: () => {
    if (!isReadyRef.current) {
      return null;
    }
    return Number.isFinite(video.currentTime) ? video.currentTime : null;
  },
  getDuration: () => {
    if (!isReadyRef.current) {
      return null;
    }
    return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
  },
  isPlaying: () => {
    if (!isReadyRef.current) {
      return false;
    }
    return !video.paused && !video.ended && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  },
  setPlaybackRate: (rate: number) => {
    video.playbackRate = rate;
    return !video.paused;
  },
  seekTo: (time: number) => {
    if (!isReadyRef.current) {
      return;
    }
    video.currentTime = time;
  },
  play: () => {
    video.play().catch(() => {});
  },
  pause: () => {
    video.pause();
  },
  mute: () => {
    video.muted = true;
  },
  unMute: () => {
    video.muted = false;
  },
  isMuted: () => video.muted,
  setVolume: (volume: number) => {
    video.volume = Math.min(1, Math.max(0, volume / 100));
  },
});

const UrlVideoPlayer = ({
  active,
  sourceUrl,
  playbackIntent,
  onInterfaceReady,
  onInterfaceClear,
  onSourceLoaded,
  onDurationChange,
  onMediaReady,
  events,
}: UrlVideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const interfaceRef = useRef<VJPlayerInterface | null>(null);
  const loadedSourceKeyRef = useRef<string | null>(null);
  const isReadyRef = useRef(false);
  const pendingSourceLoadedRef = useRef(false);
  const urlLoadReadyRef = useRef(false);
  const skipNextStateEventRef = useRef(false);
  const sourceUrlRef = useRef(sourceUrl);
  const playbackIntentRef = useRef(playbackIntent);
  const activeRef = useRef(active);
  const onSourceLoadedRef = useRef(onSourceLoaded);
  const onDurationChangeRef = useRef(onDurationChange);
  const onMediaReadyRef = useRef(onMediaReady);
  const eventsRef = useRef(events);
  const [error, setError] = useState<string | null>(null);
  const [isMediaReady, setIsMediaReady] = useState(false);

  sourceUrlRef.current = sourceUrl;
  playbackIntentRef.current = playbackIntent;
  activeRef.current = active;

  useEffect(() => {
    onSourceLoadedRef.current = onSourceLoaded;
  }, [onSourceLoaded]);

  useEffect(() => {
    onDurationChangeRef.current = onDurationChange;
  }, [onDurationChange]);

  useEffect(() => {
    onMediaReadyRef.current = onMediaReady;
  }, [onMediaReady]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const setMediaReady = useCallback((ready: boolean) => {
    isReadyRef.current = ready;
    setIsMediaReady(ready);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const iface = createVJPlayerInterface(video, isReadyRef);
    interfaceRef.current = iface;
    onInterfaceReady(iface);

    return () => {
      interfaceRef.current = null;
      onInterfaceClear?.();
    };
  }, [onInterfaceReady, onInterfaceClear]);

  const applyPostLoadPlayback = useCallback((player: VJPlayerInterface) => {
    const intent = playbackIntentRef.current;
    player.setPlaybackRate(intent.playbackRate);
    player.seekTo(intent.startTime);

    if (intent.paused) {
      if (player.isPlaying()) {
        skipNextStateEventRef.current = true;
        player.pause();
      }
    } else if (!player.isPlaying()) {
      skipNextStateEventRef.current = true;
      player.play();
    }
  }, []);

  const notifySourceLoaded = useCallback(() => {
    if (!pendingSourceLoadedRef.current) {
      return;
    }

    const player = interfaceRef.current;
    if (!player) {
      return;
    }

    pendingSourceLoadedRef.current = false;
    applyPostLoadPlayback(player);
    urlLoadReadyRef.current = true;
    setMediaReady(true);
    onDurationChangeRef.current?.(player.getDuration());
    onSourceLoadedRef.current?.();
    eventsRef.current?.onMediaReady?.();

    if (onMediaReadyRef.current) {
      onMediaReadyRef.current({
        currentTime: player.getCurrentTime() ?? 0,
        baseTime: Date.now(),
      });
    }
  }, [applyPostLoadPlayback, setMediaReady]);

  const notifyPlaybackState = useCallback((state: "pause" | "play" | "ended") => {
    if (skipNextStateEventRef.current) {
      skipNextStateEventRef.current = false;
    } else {
      notifyPlaybackStateEvents(eventsRef.current, state, playbackIntentRef.current.paused);
    }
  }, []);

  const handleEnded = useCallback(() => {
    if (!sourceUrlRef.current || !isReadyRef.current) {
      return;
    }
    notifyPlaybackState("ended");
  }, [notifyPlaybackState]);

  const handlePause = useCallback(() => {
    const video = videoRef.current;
    if (!sourceUrlRef.current || !video || !isReadyRef.current || video.ended || video.seeking) {
      return;
    }
    notifyPlaybackState("pause");
  }, [notifyPlaybackState]);

  const handlePlay = useCallback(() => {
    if (!sourceUrlRef.current || !isReadyRef.current) {
      return;
    }
    notifyPlaybackState("play");
  }, [notifyPlaybackState]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isReadyRef.current || error) {
      return;
    }
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [error]);

  const handleError = useCallback(() => {
    const video = videoRef.current;
    const message = video?.error?.message ?? "Failed to load video";
    setError(message);
    pendingSourceLoadedRef.current = false;
    urlLoadReadyRef.current = false;
    setMediaReady(false);
  }, [setMediaReady]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (!sourceUrl) {
      loadedSourceKeyRef.current = null;
      pendingSourceLoadedRef.current = false;
      urlLoadReadyRef.current = false;
      setMediaReady(false);
      setError(null);
      video.removeAttribute("src");
      video.load();
      return;
    }

    const loadKey = `url:${sourceUrl}`;
    if (loadKey === loadedSourceKeyRef.current) {
      return;
    }

    loadedSourceKeyRef.current = loadKey;
    urlLoadReadyRef.current = false;
    setError(null);
    setMediaReady(false);
    pendingSourceLoadedRef.current = true;
    video.muted = true;
    video.src = sourceUrl;
    video.load();
  }, [sourceUrl, setMediaReady]);

  useLayoutEffect(() => {
    if (!active) {
      urlLoadReadyRef.current = false;
    }
  }, [active]);

  useLayoutEffect(() => {
    const player = interfaceRef.current;
    if (!active || !sourceUrl || !player || !urlLoadReadyRef.current) {
      return;
    }

    const wantsPaused = playbackIntent.paused;
    if (wantsPaused && player.isPlaying()) {
      skipNextStateEventRef.current = true;
      player.pause();
    } else if (!wantsPaused && !player.isPlaying()) {
      skipNextStateEventRef.current = true;
      player.play();
    }
  }, [active, sourceUrl, playbackIntent.paused]);

  return (
    <div className={styles.root}>
      {/* biome-ignore lint/a11y/useMediaCaption: VJ source videos typically have no caption tracks */}
      <video
        ref={videoRef}
        className={styles.video}
        playsInline
        tabIndex={0}
        onClick={togglePlayback}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            togglePlayback();
          }
        }}
        onLoadedMetadata={notifySourceLoaded}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onError={handleError}
      />
      {(error || (sourceUrl && !isMediaReady)) && (
        <div className={styles.overlay}>
          {error ? (
            <>
              <p>URL Video Error</p>
              <p className={styles.errorMessage}>{error}</p>
            </>
          ) : (
            <p>Loading URL Video...</p>
          )}
        </div>
      )}
    </div>
  );
};

UrlVideoPlayer.displayName = "UrlVideoPlayer";

export default UrlVideoPlayer;
