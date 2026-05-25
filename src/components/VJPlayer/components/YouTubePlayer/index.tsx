import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PlaybackIntent, VJPlayerEvents, VJPlayerInterface } from "../../types";
import { notifyPlaybackStateEvents } from "../../utils";
import styles from "./index.module.css";
import type { YTPlayer, YTPlayerEvent, YTPlayerEventHandlers, YTPlayerVars } from "./types";
import { YT_PLAYER_STATE } from "./types";
import { loadYouTubeIFrameAPI } from "./utils";

const loadYouTubeVideo = (
  player: YTPlayer,
  videoId: string,
  startSeconds: number,
  paused: boolean
): void => {
  if (paused) {
    player.cueVideoById(videoId, startSeconds);
  } else {
    player.loadVideoById(videoId, startSeconds);
  }
};

const playerVars: YTPlayerVars = {
  controls: 0,
  disablekb: 1,
};

const isLoadCompleteState = (playerState: number): boolean =>
  playerState === YT_PLAYER_STATE.BUFFERING ||
  playerState === YT_PLAYER_STATE.PLAYING ||
  playerState === YT_PLAYER_STATE.PAUSED ||
  playerState === YT_PLAYER_STATE.CUED;

export interface YouTubePlayerProps {
  active: boolean;
  videoId: string | null;
  playbackIntent: PlaybackIntent;
  onInterfaceReady: (iface: VJPlayerInterface) => void;
  onInterfaceClear?: () => void;
  onSourceLoaded?: () => void;
  onDurationChange?: (duration: number | null) => void;
  events?: Pick<VJPlayerEvents, "onPaused" | "onUnpaused" | "onEnded">;
}

const createVJPlayerInterface = (player: YTPlayer): VJPlayerInterface => ({
  getCurrentTime: () => player.getCurrentTime() ?? null,
  getDuration: () => player.getDuration() ?? null,
  isPlaying: () => player.getPlayerState() === YT_PLAYER_STATE.PLAYING,
  setPlaybackRate: (rate: number) => {
    player.setPlaybackRate(rate);
    return player.getPlayerState() === YT_PLAYER_STATE.PLAYING;
  },
  seekTo: (time: number) => {
    player.seekTo(time);
  },
  play: () => player.playVideo(),
  pause: () => player.pauseVideo(),
  mute: () => player.mute(),
  unMute: () => player.unMute(),
  isMuted: () => player.isMuted(),
  setVolume: (volume: number) => player.setVolume(volume),
});

const YouTubePlayer = ({
  active,
  videoId,
  playbackIntent,
  onInterfaceReady,
  onInterfaceClear,
  onSourceLoaded,
  onDurationChange,
  events,
}: YouTubePlayerProps) => {
  const playerElementId = useId();
  const playerRef = useRef<YTPlayer | null>(null);
  const isInitializedRef = useRef(false);
  const loadedSourceKeyRef = useRef<string | null>(null);
  const pendingSourceLoadedRef = useRef(false);
  const skipNextStateEventRef = useRef(false);
  const activeRef = useRef(active);
  const playbackIntentRef = useRef(playbackIntent);
  const onSourceLoadedRef = useRef(onSourceLoaded);
  const onDurationChangeRef = useRef(onDurationChange);
  const eventsRef = useRef(events);
  const interfaceRef = useRef<VJPlayerInterface | null>(null);

  const [error, setError] = useState<string | null>(null);

  activeRef.current = active;
  playbackIntentRef.current = playbackIntent;

  useEffect(() => {
    onSourceLoadedRef.current = onSourceLoaded;
  }, [onSourceLoaded]);

  useEffect(() => {
    onDurationChangeRef.current = onDurationChange;
  }, [onDurationChange]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const syncPausedLikeState = useCallback((player: YTPlayer, wantsPaused: boolean): boolean => {
    const playerState = player.getPlayerState();
    const isPlaying =
      playerState === YT_PLAYER_STATE.PLAYING || playerState === YT_PLAYER_STATE.BUFFERING;
    const isPausedLike =
      playerState === YT_PLAYER_STATE.PAUSED || playerState === YT_PLAYER_STATE.CUED;

    if (wantsPaused && isPlaying) {
      skipNextStateEventRef.current = true;
      player.pauseVideo();
      return true;
    }
    if (!wantsPaused && isPausedLike) {
      skipNextStateEventRef.current = true;
      player.playVideo();
      return true;
    }
    return false;
  }, []);

  const syncPlaybackIntent = useCallback(
    (wantsPaused: boolean): boolean => {
      const player = playerRef.current;
      if (!player || pendingSourceLoadedRef.current) {
        return false;
      }

      return syncPausedLikeState(player, wantsPaused);
    },
    [syncPausedLikeState]
  );

  const tryLoadVideo = useCallback(() => {
    const player = playerRef.current;
    if (!active || !videoId || !player) {
      return;
    }

    const loadKey = `youtube:${videoId}`;
    if (loadKey === loadedSourceKeyRef.current) {
      return;
    }

    const intent = playbackIntentRef.current;
    loadedSourceKeyRef.current = loadKey;
    pendingSourceLoadedRef.current = true;
    loadYouTubeVideo(player, videoId, intent.startTime, intent.paused);
  }, [active, videoId]);

  const notifyLoadComplete = useCallback(
    (playerState: number) => {
      if (!pendingSourceLoadedRef.current || !isLoadCompleteState(playerState)) {
        return;
      }
      pendingSourceLoadedRef.current = false;

      const didSyncPlayback = syncPlaybackIntent(playbackIntentRef.current.paused);
      if (didSyncPlayback) {
        skipNextStateEventRef.current = true;
      }
      onSourceLoadedRef.current?.();
    },
    [syncPlaybackIntent]
  );

  const notifyPlaybackState = useCallback((playerState: number) => {
    if (!activeRef.current) {
      return;
    }

    const syncPaused = playbackIntentRef.current.paused;
    if (playerState === YT_PLAYER_STATE.PAUSED) {
      notifyPlaybackStateEvents(eventsRef.current, "pause", syncPaused);
    } else if (playerState === YT_PLAYER_STATE.PLAYING) {
      notifyPlaybackStateEvents(eventsRef.current, "play", syncPaused);
      if (!syncPaused) {
        onDurationChangeRef.current?.(interfaceRef.current?.getDuration() ?? null);
      }
    } else if (playerState === YT_PLAYER_STATE.ENDED) {
      notifyPlaybackStateEvents(eventsRef.current, "ended", syncPaused);
    }
  }, []);

  const handleReady = useCallback(
    (event: YTPlayerEvent) => {
      const player = event.target;
      player.mute();
      playerRef.current = player;
      const iface = createVJPlayerInterface(player);
      interfaceRef.current = iface;
      onInterfaceReady(iface);
      tryLoadVideo();
    },
    [onInterfaceReady, tryLoadVideo]
  );

  const handleStateChange = useCallback(
    (e: YTPlayerEvent) => {
      if (!activeRef.current) {
        return;
      }

      notifyLoadComplete(e.data);

      if (!pendingSourceLoadedRef.current) {
        if (skipNextStateEventRef.current) {
          skipNextStateEventRef.current = false;
        } else {
          notifyPlaybackState(e.data);
        }
      }
    },
    [notifyLoadComplete, notifyPlaybackState]
  );

  const playerEvents = useMemo<YTPlayerEventHandlers>(
    () => ({
      onReady: handleReady,
      onStateChange: handleStateChange,
    }),
    [handleReady, handleStateChange]
  );

  const playerEventsRef = useRef(playerEvents);
  useEffect(() => {
    playerEventsRef.current = playerEvents;
  }, [playerEvents]);

  const initializePlayer = useCallback(async () => {
    try {
      await loadYouTubeIFrameAPI();

      if (isInitializedRef.current) {
        return;
      }
      isInitializedRef.current = true;

      playerRef.current = new window.YT.Player(playerElementId, {
        playerVars,
        events: playerEventsRef.current,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("[YouTubePlayer] Failed to initialize player:", err);
      setError(errorMessage);
      isInitializedRef.current = false;
    }
  }, [playerElementId]);

  useEffect(() => {
    initializePlayer();

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      interfaceRef.current = null;
      onInterfaceClear?.();
      isInitializedRef.current = false;
      setError(null);
    };
  }, [initializePlayer, onInterfaceClear]);

  useLayoutEffect(() => {
    if (!active) {
      loadedSourceKeyRef.current = null;
      pendingSourceLoadedRef.current = false;
      playerRef.current?.pauseVideo();
    }
  }, [active]);

  useLayoutEffect(() => {
    tryLoadVideo();
  }, [tryLoadVideo]);

  useLayoutEffect(() => {
    const player = playerRef.current;
    if (!active || !videoId || !player || pendingSourceLoadedRef.current) {
      return;
    }

    const loadKey = `youtube:${videoId}`;
    if (loadKey !== loadedSourceKeyRef.current) {
      return;
    }

    syncPlaybackIntent(playbackIntent.paused);
  }, [active, videoId, playbackIntent.paused, syncPlaybackIntent]);

  return (
    <div id={playerElementId} className={styles.root}>
      <div className={styles.container}>
        <div className={styles.errorContainer}>
          {error ? (
            <>
              <p>YouTube Player Error</p>
              <p className={styles.errorMessage}>{error}</p>
            </>
          ) : (
            <p>Loading YouTube Player...</p>
          )}
        </div>
      </div>
    </div>
  );
};

YouTubePlayer.displayName = "YouTubePlayer";

export default YouTubePlayer;
