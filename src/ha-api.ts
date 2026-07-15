import type { HomeAssistant, MediaBrowseItem, ResolvedMedia } from "./types";

/** Browse a media-source folder; omit `mediaContentId` for the provider root. */
export function browseMedia(
  hass: HomeAssistant,
  mediaContentId?: string
): Promise<MediaBrowseItem> {
  const msg: Record<string, unknown> = { type: "media_source/browse_media" };
  if (mediaContentId !== undefined) {
    msg.media_content_id = mediaContentId;
  }
  return hass.callWS<MediaBrowseItem>(msg);
}

export function resolveMedia(
  hass: HomeAssistant,
  mediaContentId: string
): Promise<ResolvedMedia> {
  return hass.callWS<ResolvedMedia>({
    type: "media_source/resolve_media",
    media_content_id: mediaContentId,
  });
}

const signedPathCache = new Map<string, string>();

/**
 * Media/thumbnail paths returned by browse_media are often relative,
 * authenticated API paths. Sign them so image/video tags can load them.
 * Absolute URLs and data URIs pass through untouched.
 */
export async function signPathIfNeeded(
  hass: HomeAssistant,
  path: string
): Promise<string> {
  if (!path.startsWith("/")) return path;
  const cached = signedPathCache.get(path);
  if (cached) return cached;
  const result = await hass.callWS<{ path: string }>({
    type: "auth/sign_path",
    path,
  });
  signedPathCache.set(path, result.path);
  // Signed paths expire (default 30 s for sign_path, longer for media);
  // keep the cache short-lived so we never hand out a stale URL.
  setTimeout(() => signedPathCache.delete(path), 25_000);
  return result.path;
}
