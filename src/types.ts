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

export interface MediaGalleryListCardConfig {
  type: string;
  media_source: string;
  max_items?: number;
  title?: string;
  refresh_interval?: number;
  reverse?: boolean;
}

export const DEFAULT_MAX_ITEMS = 3;
export const MAX_MAX_ITEMS = 20;
