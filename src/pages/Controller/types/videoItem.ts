import type { VideoSource } from "@/components/VJPlayer/types";

export type VideoItem = {
  source: VideoSource;
  title?: string;
  start?: number;
};
