import type { VJPlayerRef, VJSyncData } from "@/components/VJPlayer/types";
import { getEffectiveSyncTime } from "@/components/VJPlayer/utils";
import type { LibraryAPI } from "@/pages/Controller/components/Library/types";
import { useControllerAPIContext } from "@/pages/Controller/contexts/ControllerAPIContext";
import type { VideoItem } from "@/pages/Controller/types/videoItem";
import {
  normalizeVideoItem,
  revokeDeckBlobUrlUnlessInPlaylist,
} from "@/pages/Controller/utils/videoItem";
import { normalizeNumericValue } from "@/utils";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { DeckAPI } from "../../types";

const revokePreviousDeckBlob = (
  previous: VJSyncData | null | undefined,
  libraryAPI: LibraryAPI | null
) => {
  if (previous?.source.type !== "url") {
    return;
  }
  const playlistItems = libraryAPI
    ? libraryAPI.playlists.getAllNames().flatMap((name) => libraryAPI.playlists.get(name))
    : [];
  revokeDeckBlobUrlUnlessInPlaylist(previous.source.url, playlistItems);
};

interface UseDeckAPIParams {
  vjPlayerRef: RefObject<VJPlayerRef | null>;
  syncDataRef: RefObject<VJSyncData | null> | React.MutableRefObject<VJSyncData | null>;
  updateSyncData: (partialSyncData: Partial<VJSyncData>) => void;
  deckId: number;
  onHotCuesChange?: (hotCues: Map<number, number>) => void;
  onVolumeChange?: (volume: number) => void;
  onMuteChange?: (isMuted: boolean) => void;
  onOpacityChange?: (opacity: number) => void;
}

export const useDeckAPI = ({
  vjPlayerRef,
  syncDataRef,
  updateSyncData,
  deckId,
  onHotCuesChange,
  onVolumeChange,
  onMuteChange,
  onOpacityChange,
}: UseDeckAPIParams) => {
  const deckAPIRef = useRef<DeckAPI | null>(null);
  const { setDeckAPI, historyAPI, settings, libraryAPI } = useControllerAPIContext();
  const libraryAPIRef = useRef(libraryAPI);
  libraryAPIRef.current = libraryAPI;
  const hotCuesRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    deckAPIRef.current = {
      playVideo: () => {
        if (syncDataRef.current?.paused) {
          updateSyncData({
            baseTime: Date.now(),
            paused: false,
          });
        }
      },
      pauseVideo: () => {
        updateSyncData({
          baseTime: Date.now(),
          currentTime: vjPlayerRef.current?.getCurrentTime() ?? 0,
          paused: true,
        });
      },
      isPlaying: () => {
        return syncDataRef.current?.paused === false;
      },
      seekTo: (seconds: number) => {
        updateSyncData({
          baseTime: Date.now(),
          currentTime: seconds,
        });
      },
      adjustTiming: (relativeTime: number) => {
        const sync = syncDataRef.current;
        if (!sync) {
          return;
        }
        updateSyncData({
          baseTime: Date.now(),
          currentTime: getEffectiveSyncTime(sync) + relativeTime,
        });
      },
      setHotCue: (cueId: number, time?: number) => {
        const targetTime = time ?? vjPlayerRef.current?.getCurrentTime() ?? 0;
        hotCuesRef.current.set(cueId, targetTime);
        onHotCuesChange?.(hotCuesRef.current);
      },
      jumpToHotCue: (cueId: number) => {
        const targetTime = hotCuesRef.current.get(cueId);
        if (targetTime !== undefined) {
          deckAPIRef.current?.seekTo(targetTime);
        }
      },
      deleteHotCue: (cueId: number) => {
        hotCuesRef.current.delete(cueId);
        onHotCuesChange?.(hotCuesRef.current);
      },
      hasHotCue: (cueId: number) => {
        return hotCuesRef.current.has(cueId);
      },
      setLoopStart: (time?: number) => {
        const targetTime = time ?? vjPlayerRef.current?.getCurrentTime() ?? 0;
        updateSyncData({
          loopStart: targetTime,
        });
      },
      setLoopEnd: (time?: number) => {
        const targetTime = time ?? vjPlayerRef.current?.getCurrentTime() ?? 0;
        updateSyncData({
          loopEnd: targetTime,
        });
      },
      clearLoop: () => {
        updateSyncData({
          loopStart: null,
          loopEnd: null,
        });
      },
      mute: () => {
        vjPlayerRef.current?.getPlayer()?.mute();
        onMuteChange?.(true);
      },
      unMute: () => {
        vjPlayerRef.current?.getPlayer()?.unMute();
        onMuteChange?.(false);
      },
      isMuted: () => {
        return vjPlayerRef.current?.getPlayer()?.isMuted() ?? false;
      },
      setVolume: (volume: number) => {
        vjPlayerRef.current?.getPlayer()?.setVolume(volume);
        onVolumeChange?.(volume);
      },
      setPlaybackRate: (rate: number) => {
        updateSyncData({
          currentTime: vjPlayerRef.current?.getCurrentTime() ?? 0,
          baseTime: Date.now(),
          playbackRate: Number.parseFloat(rate.toFixed(2)),
        });
      },
      setFilters: (filters: Record<string, string>) => {
        updateSyncData({
          filters: {
            ...syncDataRef.current?.filters,
            ...filters,
          },
        });
        onOpacityChange?.("opacity" in filters ? normalizeNumericValue(filters.opacity) : 1);
      },
      loadVideo: (video: VideoItem | string) => {
        revokePreviousDeckBlob(syncDataRef.current, libraryAPIRef.current);
        const videoObj = normalizeVideoItem(video);
        const source =
          videoObj.source.type === "youtube"
            ? { type: "youtube" as const, videoId: videoObj.source.videoId }
            : { type: "url" as const, url: videoObj.source.url };
        const updateData: Partial<VJSyncData> = {
          source,
          currentTime: videoObj.start ?? 0,
          baseTime: Date.now(),
          loopStart: null,
          loopEnd: null,
        };
        if (!settings.preservePauseState) {
          updateData.paused = false;
        }
        updateSyncData(updateData);
        deckAPIRef.current?.unMute();
        hotCuesRef.current.clear();
        onHotCuesChange?.(hotCuesRef.current);
        if (videoObj.source.type === "youtube") {
          historyAPI.add(videoObj.source.videoId);
        }
      },
      getCurrentTime: () => {
        return vjPlayerRef.current?.getCurrentTime() ?? 0;
      },
      getDuration: () => {
        return vjPlayerRef.current?.getPlayer()?.getDuration() ?? 0;
      },
    } as DeckAPI;
    setDeckAPI(deckId, deckAPIRef.current);
  }, [
    deckId,
    setDeckAPI,
    updateSyncData,
    vjPlayerRef,
    syncDataRef,
    historyAPI,
    onHotCuesChange,
    onVolumeChange,
    onMuteChange,
    onOpacityChange,
    settings,
  ]);

  return deckAPIRef;
};
