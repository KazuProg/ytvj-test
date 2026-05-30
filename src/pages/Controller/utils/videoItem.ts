import type { VideoItem } from "@/pages/Controller/types/videoItem";

export const getVideoFilesFromDataTransfer = (dataTransfer: DataTransfer): File[] => {
  return Array.from(dataTransfer.files).filter((file) => file.type.startsWith("video/"));
};

export function createYouTubeVideoItem(
  videoId: string,
  options?: { title?: string; start?: number }
): VideoItem {
  return {
    source: { type: "youtube", videoId },
    title: options?.title,
    start: options?.start,
  };
}

export function createUrlVideoItem(
  url: string,
  options?: { title?: string; start?: number }
): VideoItem {
  return {
    source: { type: "url", url },
    title: options?.title,
    start: options?.start,
  };
}

export function createLocalFileVideoItem(file: File): VideoItem {
  const title = file.name.replace(/\.[^/.]+$/, "") || file.name;
  return createUrlVideoItem(URL.createObjectURL(file), { title });
}

export function revokeBlobUrl(url: string | null | undefined): void {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export function revokeVideoItemBlobUrl(item: VideoItem): void {
  if (item.source.type === "url") {
    revokeBlobUrl(item.source.url);
  }
}

export function revokeVideoItemsBlobUrls(items: VideoItem[]): void {
  for (const item of items) {
    revokeVideoItemBlobUrl(item);
  }
}

/** プレイリスト等に登録済みの blob URL（revoke 対象外） */
export function collectBlobUrlsFromVideoItems(items: Iterable<VideoItem>): ReadonlySet<string> {
  const urls = new Set<string>();
  for (const item of items) {
    if (item.source.type === "url" && item.source.url.startsWith("blob:")) {
      urls.add(item.source.url);
    }
  }
  return urls;
}

/** retained に含まれない blob URL のみ revoke する */
export function revokeBlobUrlIfNotRetained(
  url: string | null | undefined,
  retained: ReadonlySet<string>
): void {
  if (!url?.startsWith("blob:") || retained.has(url)) {
    return;
  }
  URL.revokeObjectURL(url);
}

/** プレイリストに無い Deck 用 blob のみ revoke する */
export function revokeDeckBlobUrlUnlessInPlaylist(
  url: string | null | undefined,
  playlistItems: Iterable<VideoItem>
): void {
  revokeBlobUrlIfNotRetained(url, collectBlobUrlsFromVideoItems(playlistItems));
}

/** YouTube 以外の video タグ再生可能 URL（https / blob 等）かどうか */
export function isDirectVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "blob:") {
      return true;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be" || host.endsWith(".youtube.com") || host === "youtube.com") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function normalizeVideoItem(video: VideoItem | string): VideoItem {
  if (typeof video === "string") {
    if (isDirectVideoUrl(video)) {
      return createUrlVideoItem(video);
    }
    return createYouTubeVideoItem(video);
  }
  return video;
}

export function getYouTubeVideoId(item: VideoItem): string | null {
  return item.source.type === "youtube" ? item.source.videoId : null;
}

export function getVideoItemKey(item: VideoItem): string {
  return item.source.type === "youtube" ? item.source.videoId : item.source.url;
}

export function getPreparedVideoInputValue(item: VideoItem | null): string {
  if (!item) {
    return "";
  }
  if (item.source.type === "youtube") {
    return item.source.videoId;
  }
  if (item.source.url.startsWith("blob:") && item.title) {
    return item.title;
  }
  return item.source.url;
}

export function getPreparedVideoUrl(item: VideoItem | null): string | null {
  return item?.source.type === "url" ? item.source.url : null;
}

export function getVideoItemDisplayText(item: VideoItem): string {
  if (item.title) {
    return item.title;
  }
  if (item.source.type === "youtube") {
    return item.source.videoId;
  }
  return item.source.url;
}
