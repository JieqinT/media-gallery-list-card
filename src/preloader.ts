/**
 * Background preloader for the next rotation clip.
 *
 * Signed media URLs expire ~30 s after signing and change on every re-sign,
 * so warming the browser's HTTP cache is unreliable. Instead the clip is
 * fetched into a Blob and handed to the player as an object URL, which never
 * expires and starts playing instantly.
 *
 * At most one clip is preloaded at a time. Every failure path resolves to
 * `undefined` so callers can fall back to the normal resolve-on-demand flow.
 */

import { resolveMedia, signPathIfNeeded } from "./ha-api";
import { isHlsMime, type HomeAssistant } from "./types";

export interface PreloadedClip {
  url: string;
  mimeType: string;
}

interface PendingPreload {
  contentId: string;
  controller: AbortController;
  promise: Promise<PreloadedClip | undefined>;
  objectUrl?: string;
}

/** Revoke late enough that a replaced <video> can't still be reading the blob. */
const REVOKE_DELAY_MS = 10_000;

function revokeLater(url: string | undefined): void {
  if (url) setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

export class ClipPreloader {
  private _pending?: PendingPreload;
  private _activeObjectUrl?: string;

  /** Abort any previous pending preload and start fetching this clip. */
  public start(hass: HomeAssistant, mediaContentId: string): void {
    if (this._pending?.contentId === mediaContentId) return;
    this._discardPending();
    const controller = new AbortController();
    const pending: PendingPreload = {
      contentId: mediaContentId,
      controller,
      promise: this._fetchClip(hass, mediaContentId, controller).catch((err) => {
        console.debug("media-gallery-list-card: preload failed", err);
        return undefined;
      }),
    };
    pending.promise.then((clip) => {
      if (clip && this._pending === pending) pending.objectUrl = clip.url;
    });
    this._pending = pending;
  }

  /** If a preload (done or in flight) matches, await it and hand it over. */
  public async take(
    mediaContentId: string
  ): Promise<PreloadedClip | undefined> {
    const pending = this._pending;
    if (!pending || pending.contentId !== mediaContentId) return undefined;
    const clip = await pending.promise;
    if (this._pending !== pending) return undefined; // superseded meanwhile
    this._pending = undefined;
    if (!clip) return undefined;
    // The previously handed-out URL is no longer needed once the player moves on.
    revokeLater(this._activeObjectUrl);
    this._activeObjectUrl = clip.url;
    return clip;
  }

  /** Abort any pending fetch and release all object URLs. */
  public dispose(): void {
    this._discardPending();
    revokeLater(this._activeObjectUrl);
    this._activeObjectUrl = undefined;
  }

  private _discardPending(): void {
    const pending = this._pending;
    if (!pending) return;
    this._pending = undefined;
    pending.controller.abort();
    if (pending.objectUrl) {
      revokeLater(pending.objectUrl);
    } else {
      // Fetch may still complete after the abort raced it; clean up then.
      pending.promise.then((clip) => revokeLater(clip?.url));
    }
  }

  private async _fetchClip(
    hass: HomeAssistant,
    mediaContentId: string,
    controller: AbortController
  ): Promise<PreloadedClip | undefined> {
    const resolved = await resolveMedia(hass, mediaContentId);
    if (isHlsMime(resolved.mime_type)) return undefined;
    if (controller.signal.aborted) return undefined;
    const url = await signPathIfNeeded(hass, resolved.url);
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), mimeType: resolved.mime_type };
  }
}
