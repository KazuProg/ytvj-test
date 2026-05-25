import { INITIAL_SYNC_DATA, SYNC_CONFIG } from "@/constants";
import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { VJPlayerInterface, VJSyncData } from "../../types";
import { hasSourceChanged } from "../../utils";
import { usePlaybackRateAdjustment } from "../usePlaybackRateAdjustment";
import { useTimeSync } from "../useTimeSync";

/** カスタムフックの戻り値 */
export interface UsePlayerSyncReturn {
  getCurrentTime: () => number | null;
  setDuration: (duration: number | null) => void;
  notifySyncData: (syncData: VJSyncData) => void;
  markSourceLoaded: () => void;
}

/**
 * プレイヤー同期用のカスタムフック
 * 時間同期と速度調整を統合して、プレイヤーの同期を管理する
 */
export const usePlayerSync = (
  playerRef: RefObject<VJPlayerInterface | null>
): UsePlayerSyncReturn => {
  const syncDataRef = useRef<VJSyncData>(INITIAL_SYNC_DATA);
  const isSyncingRef = useRef<boolean>(false);
  const isSourceLoadingRef = useRef(true);

  const { getExpectedCurrentTime, setDuration } = useTimeSync(syncDataRef);

  const { calculateAdjustmentRate, applyPlaybackRateAdjustment, syncPlaybackRate } =
    usePlaybackRateAdjustment({
      syncDataRef,
      setPlaybackRate: (rate: number) => playerRef.current?.setPlaybackRate(rate) ?? false,
    });

  const _sync = useCallback(() => {
    if (isSourceLoadingRef.current || syncDataRef.current.paused) {
      return;
    }

    const expectedCurrentTime = getExpectedCurrentTime();
    if (expectedCurrentTime === null) {
      return;
    }

    try {
      const syncData = syncDataRef.current;
      const currentPlayerTime = playerRef.current?.getCurrentTime() ?? null;

      if (currentPlayerTime === null) {
        return;
      }

      const timeDiff = currentPlayerTime - expectedCurrentTime;
      const absTimeDiff = Math.abs(timeDiff);

      if (absTimeDiff <= SYNC_CONFIG.syncThreshold) {
        syncPlaybackRate();
        isSyncingRef.current = false;
      } else if (absTimeDiff >= SYNC_CONFIG.seekThreshold) {
        playerRef.current?.seekTo(expectedCurrentTime);
      } else {
        const adjustmentRate = calculateAdjustmentRate(timeDiff, syncData.playbackRate);
        applyPlaybackRateAdjustment(adjustmentRate);
      }
    } catch (error) {
      console.warn("[usePlayerSync] Failed to sync:", error);
    }
  }, [
    getExpectedCurrentTime,
    playerRef,
    syncPlaybackRate,
    calculateAdjustmentRate,
    applyPlaybackRateAdjustment,
  ]);

  useEffect(() => {
    const isNeedLoopAdjust = () => {
      const syncData = syncDataRef.current;
      if (syncData.loopStart == null || syncData.loopEnd == null) {
        return false;
      }
      const expectedCurrentTime = getExpectedCurrentTime();
      if (expectedCurrentTime === null) {
        return false;
      }
      return syncData.loopEnd < expectedCurrentTime;
    };

    const calculateLoopAdjustTime = () => {
      const syncData = syncDataRef.current;
      if (syncData.loopStart == null || syncData.loopEnd == null) {
        throw new Error("loopStart or loopEnd is not set");
      }
      return (syncData.loopEnd - syncData.loopStart) * 1000 * (1 / syncData.playbackRate);
    };

    let animationFrameId = 0;
    const loop = () => {
      const syncData = syncDataRef.current;

      if (!syncData.paused && !isSourceLoadingRef.current) {
        if (isNeedLoopAdjust()) {
          syncData.baseTime += calculateLoopAdjustTime();
          isSyncingRef.current = true;
        }

        if (isSyncingRef.current) {
          _sync();
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);

    const interval = setInterval(() => {
      isSyncingRef.current = true;
    }, SYNC_CONFIG.interval);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(interval);
    };
  }, [_sync, getExpectedCurrentTime]);

  const markSourceLoaded = useCallback(() => {
    isSourceLoadingRef.current = false;
    isSyncingRef.current = false;
  }, []);

  const notifySyncData = useCallback((syncData: VJSyncData) => {
    const beforeSyncData = syncDataRef.current;
    const sourceChanged = hasSourceChanged(syncData.source, beforeSyncData.source);

    syncDataRef.current = syncData;

    if (sourceChanged) {
      isSourceLoadingRef.current = true;
      isSyncingRef.current = false;
    } else {
      const needTimingSync =
        syncData.baseTime !== beforeSyncData.baseTime ||
        syncData.currentTime !== beforeSyncData.currentTime ||
        syncData.playbackRate !== beforeSyncData.playbackRate;

      if (needTimingSync) {
        isSyncingRef.current = true;
      }
    }
  }, []);

  return {
    getCurrentTime: getExpectedCurrentTime,
    setDuration,
    notifySyncData,
    markSourceLoaded,
  };
};
