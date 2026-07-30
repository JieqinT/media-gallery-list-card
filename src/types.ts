/** Minimal Home Assistant frontend types used by this card. */

export interface HomeAssistant {
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  locale?: { language?: string };
  language?: string;
}

/** One node returned by media_source/browse_media. */
export interface MediaBrowseItem {
  title: string;
  media_class: string;
  media_content_type: string;
  media_content_id: string;
  can_play: boolean;
  can_expand: boolean;
  thumbnail?: string | null;
  children?: MediaBrowseItem[];
}

/** Result of media_source/resolve_media. */
export interface ResolvedMedia {
  url: string;
  mime_type: string;
}

export type AspectRatio = "16:9" | "4:3" | "1:1";

export interface MediaGalleryListCardConfig {
  type: string;
  media_source: string;
  max_items?: number;
  title?: string;
  refresh_interval?: number;
  reverse?: boolean;
  layout?: "list" | "grid";
  columns?: number;
  grid_aspect_ratio?: AspectRatio;
  list_aspect_ratio?: AspectRatio;
  player_aspect_ratio?: "auto" | AspectRatio;
  show_title?: boolean;
  title_format?: string;
  autoplay_rotation?: boolean;
  rotation_show_list?: boolean;
  preload?: boolean;
}

export const DEFAULT_MAX_ITEMS = 3;
export const MAX_MAX_ITEMS = 20;
export const DEFAULT_COLUMNS = 3;
export const MAX_COLUMNS = 6;
export const ASPECT_RATIOS: readonly AspectRatio[] = ["16:9", "4:3", "1:1"];
export const DEFAULT_ASPECT_RATIO: AspectRatio = "16:9";

/** "16:9" → "16 / 9" for use as a CSS aspect-ratio value. */
export function aspectRatioCss(ratio: AspectRatio): string {
  return ratio.replace(":", " / ");
}

/** "16:9" → 16/9 as a number (for height calculations). */
export function aspectRatioNumber(ratio: AspectRatio): number {
  const [w, h] = ratio.split(":").map(Number);
  return w / h;
}

/** HLS playlists play via ha-hls-player and cannot be preloaded as a Blob. */
export function isHlsMime(mime: string): boolean {
  return (
    mime === "application/x-mpegURL" || mime === "application/vnd.apple.mpegurl"
  );
}
