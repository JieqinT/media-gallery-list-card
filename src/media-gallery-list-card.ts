import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { browseMedia, resolveMedia, signPathIfNeeded } from "./ha-api";
import {
  ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_COLUMNS,
  DEFAULT_MAX_ITEMS,
  MAX_COLUMNS,
  MAX_MAX_ITEMS,
  aspectRatioCss,
  aspectRatioNumber,
  type AspectRatio,
  type HomeAssistant,
  type MediaBrowseItem,
  type MediaGalleryListCardConfig,
} from "./types";
import { formatItemTitle } from "./title-format";
import "./editor";

interface ListedItem {
  item: MediaBrowseItem;
  thumbnailUrl?: string;
  displayTitle: string;
}

interface PlayingItem {
  title: string;
  url: string;
  mimeType: string;
  /** Index in _items when part of a rotation, undefined for manual play. */
  rotationIndex?: number;
}

const STRINGS: Record<string, Record<string, string>> = {
  en: {
    no_media_source: "Set “media_source” to a media-source:// URI",
    no_items: "No recordings",
    load_error: "Could not load media list",
    play_error: "Could not play this item",
    close: "Close",
    unmute: "Tap to unmute",
    mute: "Mute",
  },
  de: {
    no_media_source: "„media_source“ auf eine media-source:// URI setzen",
    no_items: "Keine Aufnahmen",
    load_error: "Medienliste konnte nicht geladen werden",
    play_error: "Dieses Element konnte nicht abgespielt werden",
    close: "Schließen",
    unmute: "Zum Entstummen tippen",
    mute: "Stumm",
  },
};

class MediaGalleryListCard extends LitElement {
  private _hass?: HomeAssistant;
  private _config?: MediaGalleryListCardConfig;
  private _refreshTimer?: number;
  private _loadedFor?: string;
  private _rotationErrorStreak = 0;
  private _rotationMuted = true;

  @state() private _items: ListedItem[] = [];
  @state() private _loading = false;
  @state() private _error?: string;
  @state() private _playing?: PlayingItem;

  public setConfig(config: MediaGalleryListCardConfig): void {
    if (!config || typeof config.media_source !== "string" || !config.media_source) {
      throw new Error("media_source (a media-source:// URI) is required");
    }
    if (!config.media_source.startsWith("media-source://")) {
      throw new Error("media_source must start with media-source://");
    }
    const maxItems = config.max_items ?? DEFAULT_MAX_ITEMS;
    if (typeof maxItems !== "number" || maxItems < 1 || maxItems > MAX_MAX_ITEMS) {
      throw new Error(`max_items must be a number between 1 and ${MAX_MAX_ITEMS}`);
    }
    if (config.layout !== undefined && !["list", "grid"].includes(config.layout)) {
      throw new Error('layout must be "list" or "grid"');
    }
    const columns = config.columns ?? DEFAULT_COLUMNS;
    if (typeof columns !== "number" || columns < 1 || columns > MAX_COLUMNS) {
      throw new Error(`columns must be a number between 1 and ${MAX_COLUMNS}`);
    }
    for (const key of ["grid_aspect_ratio", "list_aspect_ratio"] as const) {
      const value = config[key];
      if (value !== undefined && !ASPECT_RATIOS.includes(value)) {
        throw new Error(`${key} must be one of "16:9", "4:3", "1:1"`);
      }
    }
    if (
      config.player_aspect_ratio !== undefined &&
      config.player_aspect_ratio !== "auto" &&
      !ASPECT_RATIOS.includes(config.player_aspect_ratio)
    ) {
      throw new Error(
        'player_aspect_ratio must be one of "auto", "16:9", "4:3", "1:1"'
      );
    }
    if (
      config.title_format !== undefined &&
      typeof config.title_format !== "string"
    ) {
      throw new Error("title_format must be a string");
    }
    this._config = config;
    this._loadedFor = undefined;
    this._playing = undefined;
    this._rotationErrorStreak = 0;
    this._scheduleRefreshTimer();
    this._maybeLoad();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._maybeLoad();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._loadedFor = undefined;
    this._scheduleRefreshTimer();
    this._maybeLoad();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._refreshTimer) {
      window.clearInterval(this._refreshTimer);
      this._refreshTimer = undefined;
    }
    this._playing = undefined;
  }

  public getCardSize(): number {
    return 1 + (this._config?.max_items ?? DEFAULT_MAX_ITEMS);
  }

  public static getConfigElement(): HTMLElement {
    return document.createElement("media-gallery-list-card-editor");
  }

  public static getStubConfig(): Record<string, unknown> {
    return { media_source: "", max_items: DEFAULT_MAX_ITEMS };
  }

  private _t(key: string): string {
    const lang = this._hass?.locale?.language ?? this._hass?.language ?? "en";
    return STRINGS[lang.split("-")[0]]?.[key] ?? STRINGS.en[key] ?? key;
  }

  private get _showTitle(): boolean {
    return this._config?.show_title !== false;
  }

  private get _rotationEnabled(): boolean {
    return this._config?.autoplay_rotation === true;
  }

  private _scheduleRefreshTimer(): void {
    if (this._refreshTimer) {
      window.clearInterval(this._refreshTimer);
      this._refreshTimer = undefined;
    }
    const interval = this._config?.refresh_interval ?? 0;
    if (interval > 0 && this.isConnected) {
      this._refreshTimer = window.setInterval(() => {
        this._loadedFor = undefined;
        this._maybeLoad();
      }, Math.max(10, interval) * 1000);
    }
  }

  /** Load once per (config, connect, interval-tick) — not on every hass update. */
  private async _maybeLoad(): Promise<void> {
    if (!this._hass || !this._config) return;
    const key = `${this._config.media_source}|${this._config.max_items}|${this._config.reverse}`;
    if (this._loadedFor === key) return;
    this._loadedFor = key;

    this._loading = true;
    this._error = undefined;
    try {
      const root = await browseMedia(this._hass, this._config.media_source);
      let videos = (root.children ?? []).filter(
        (c) =>
          c.can_play &&
          (c.media_class === "video" ||
            (c.media_content_type ?? "").startsWith("video"))
      );
      if (this._config.reverse) videos = videos.reverse();
      videos = videos.slice(0, this._config.max_items ?? DEFAULT_MAX_ITEMS);

      const items: ListedItem[] = await Promise.all(
        videos.map(async (item) => {
          let thumbnailUrl: string | undefined;
          if (item.thumbnail) {
            try {
              thumbnailUrl = await signPathIfNeeded(this._hass!, item.thumbnail);
            } catch {
              thumbnailUrl = undefined;
            }
          }
          return {
            item,
            thumbnailUrl,
            displayTitle: formatItemTitle(
              item.title,
              item.media_content_id,
              this._config?.title_format
            ),
          };
        })
      );
      this._items = items;
      // Kick off (or continue) rotation once we have items.
      if (this._rotationEnabled && items.length && this._playing === undefined) {
        this._playRotationIndex(0);
      }
    } catch (err) {
      this._error = `${this._t("load_error")}: ${
        err instanceof Error ? err.message : String(err)
      }`;
      this._items = [];
    } finally {
      this._loading = false;
    }
  }

  private async _resolveFor(listed: ListedItem): Promise<PlayingItem | undefined> {
    if (!this._hass) return undefined;
    const resolved = await resolveMedia(this._hass, listed.item.media_content_id);
    const url = await signPathIfNeeded(this._hass, resolved.url);
    return { title: listed.displayTitle, url, mimeType: resolved.mime_type };
  }

  private async _play(listed: ListedItem, rotationIndex?: number): Promise<void> {
    try {
      const playing = await this._resolveFor(listed);
      if (!playing) return;
      playing.rotationIndex = rotationIndex;
      this._playing = playing;
      this._rotationErrorStreak = 0;
    } catch (err) {
      if (rotationIndex !== undefined) {
        this._rotationAdvance(rotationIndex, true);
      } else {
        this._error = `${this._t("play_error")}: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    }
  }

  private _playRotationIndex(index: number): void {
    const listed = this._items[index];
    if (!listed) return;
    void this._play(listed, index);
  }

  /** Move rotation to the next clip; wraps by reloading the list. */
  private _rotationAdvance(fromIndex: number, failed = false): void {
    if (!this._rotationEnabled || !this.isConnected) return;
    if (failed) {
      this._rotationErrorStreak += 1;
      if (this._rotationErrorStreak >= Math.max(1, this._items.length)) {
        this._playing = undefined;
        this._error = this._t("play_error");
        return;
      }
    }
    const next = fromIndex + 1;
    if (next < this._items.length) {
      this._playRotationIndex(next);
    } else {
      // End of playlist: refresh the list so new detections join, then restart.
      this._playing = undefined;
      this._loadedFor = undefined;
      void this._maybeLoad();
    }
  }

  private _onVideoEnded(): void {
    const idx = this._playing?.rotationIndex;
    if (idx !== undefined) {
      this._rotationAdvance(idx);
    }
  }

  private _onVideoError(): void {
    const idx = this._playing?.rotationIndex;
    if (idx !== undefined) {
      this._rotationAdvance(idx, true);
    }
  }

  private _closePlayer(): void {
    this._playing = undefined;
  }

  private _toggleMute(): void {
    this._rotationMuted = !this._rotationMuted;
    const video = this.shadowRoot?.querySelector("video");
    if (video) video.muted = this._rotationMuted;
    this.requestUpdate();
  }

  private _renderPlayer(playing: PlayingItem): TemplateResult {
    const rotating = playing.rotationIndex !== undefined;
    const isHls =
      playing.mimeType === "application/x-mpegURL" ||
      playing.mimeType === "application/vnd.apple.mpegurl";
    const haHlsAvailable = isHls && !!customElements.get("ha-hls-player");
    const playerRatio = this._config?.player_aspect_ratio ?? "auto";
    const fixed = playerRatio !== "auto";
    return html`
      <div class="player">
        <div class="player-bar">
          <span class="player-title">
            ${playing.title}${rotating
              ? html` <span class="rotation-pos"
                  >${playing.rotationIndex! + 1}/${this._items.length}</span
                >`
              : nothing}
          </span>
          <span class="player-actions">
            ${rotating
              ? html`<button class="pill" @click=${this._toggleMute}>
                  ${this._rotationMuted ? `🔇 ${this._t("unmute")}` : `🔊 ${this._t("mute")}`}
                </button>`
              : nothing}
            ${!rotating
              ? html`<button
                  class="close"
                  aria-label=${this._t("close")}
                  @click=${this._closePlayer}
                >
                  ✕
                </button>`
              : nothing}
          </span>
        </div>
        <div
          class="player-frame${fixed ? " fixed" : ""}"
          style=${fixed
            ? `aspect-ratio: ${aspectRatioCss(playerRatio as AspectRatio)}`
            : nothing}
        >
          ${haHlsAvailable
            ? html`<ha-hls-player
                .hass=${this._hass}
                .url=${playing.url}
                controls
                autoplay
                playsinline
                .muted=${rotating ? this._rotationMuted : false}
              ></ha-hls-player>`
            : html`<video
                src=${playing.url}
                controls
                autoplay
                playsinline
                .muted=${rotating ? this._rotationMuted : false}
                @ended=${this._onVideoEnded}
                @error=${this._onVideoError}
              ></video>`}
        </div>
      </div>
    `;
  }

  private _renderRow(listed: ListedItem, index: number): TemplateResult {
    return html`
      <button class="row" @click=${() => this._onItemTap(listed, index)}>
        ${listed.thumbnailUrl
          ? html`<img class="thumb" src=${listed.thumbnailUrl} alt="" />`
          : html`<div class="thumb placeholder" aria-hidden="true">▶</div>`}
        ${this._showTitle
          ? html`<span class="row-title">${listed.displayTitle}</span>`
          : nothing}
      </button>
    `;
  }

  private _renderTile(listed: ListedItem, index: number): TemplateResult {
    return html`
      <button class="tile" @click=${() => this._onItemTap(listed, index)}>
        ${listed.thumbnailUrl
          ? html`<img class="tile-img" src=${listed.thumbnailUrl} alt="" />`
          : html`<div class="tile-img placeholder" aria-hidden="true">▶</div>`}
        ${this._showTitle
          ? html`<span class="tile-caption">${listed.displayTitle}</span>`
          : nothing}
      </button>
    `;
  }

  private _onItemTap(listed: ListedItem, index: number): void {
    // In rotation mode a tap jumps the rotation to that clip;
    // otherwise it is a plain manual play.
    void this._play(listed, this._rotationEnabled ? index : undefined);
  }

  private get _gridRatio(): AspectRatio {
    return this._config?.grid_aspect_ratio ?? DEFAULT_ASPECT_RATIO;
  }

  private get _listRatio(): AspectRatio {
    return this._config?.list_aspect_ratio ?? DEFAULT_ASPECT_RATIO;
  }

  private _renderItems(): TemplateResult {
    if ((this._config?.layout ?? "list") === "grid") {
      const columns = this._config?.columns ?? DEFAULT_COLUMNS;
      return html`
        <div
          class="grid"
          style="grid-template-columns: repeat(${columns}, 1fr); --mglc-tile-ar: ${aspectRatioCss(
            this._gridRatio
          )}"
        >
          ${this._items.map((i, idx) => this._renderTile(i, idx))}
        </div>
      `;
    }
    return html`
      <div class="rows" style="--mglc-thumb-ar: ${aspectRatioCss(this._listRatio)}">
        ${this._items.map((i, idx) => this._renderRow(i, idx))}
      </div>
    `;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    const showList =
      !this._rotationEnabled || this._config.rotation_show_list === true;
    return html`
      <ha-card>
        ${this._config.title
          ? html`<h1 class="card-header">${this._config.title}</h1>`
          : nothing}
        <div class="content">
          ${this._error ? html`<div class="error">${this._error}</div>` : nothing}
          ${this._playing ? this._renderPlayer(this._playing) : nothing}
          ${this._loading && !this._items.length
            ? html`<div
                class="skeletons"
                style="--mglc-skel-h: ${Math.round(
                  96 / aspectRatioNumber(this._listRatio)
                ) + 8}px"
              >
                ${Array.from(
                  { length: this._config.max_items ?? DEFAULT_MAX_ITEMS },
                  () => html`<div class="skeleton"></div>`
                )}
              </div>`
            : nothing}
          ${!this._loading && !this._error && !this._items.length
            ? html`<div class="empty">${this._t("no_items")}</div>`
            : nothing}
          ${showList ? this._renderItems() : nothing}
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    .card-header {
      font-size: var(--ha-font-size-l, 1.2rem);
      font-weight: 500;
      padding: 12px 16px 0;
      margin: 0;
    }
    .content {
      padding: 8px 12px 12px;
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 4px;
      border: none;
      border-radius: 8px;
      background: none;
      cursor: pointer;
      text-align: left;
      color: var(--primary-text-color);
      font: inherit;
    }
    .row:hover,
    .row:focus-visible {
      background: var(--secondary-background-color);
    }
    .thumb {
      width: 96px;
      aspect-ratio: var(--mglc-thumb-ar, 16 / 9);
      height: auto;
      flex-shrink: 0;
      border-radius: 6px;
      object-fit: cover;
      background: var(--secondary-background-color);
    }
    .placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text-color);
      font-size: 20px;
    }
    .row-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .grid {
      display: grid;
      gap: 8px;
    }
    .tile {
      position: relative;
      padding: 0;
      border: none;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      background: var(--secondary-background-color);
      aspect-ratio: var(--mglc-tile-ar, 16 / 9);
      font: inherit;
    }
    .tile-img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .tile-img.placeholder {
      position: absolute;
    }
    .tile-caption {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 12px 8px 6px;
      font-size: 12px;
      color: #fff;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
    }
    .tile:hover .tile-img,
    .tile:focus-visible .tile-img {
      filter: brightness(1.1);
    }
    .player {
      margin-bottom: 8px;
    }
    .player-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 4px 0;
    }
    .player-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
      min-width: 0;
    }
    .rotation-pos {
      color: var(--secondary-text-color);
      font-weight: 400;
      font-size: 0.9em;
    }
    .player-actions {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .pill {
      border: none;
      border-radius: 12px;
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      cursor: pointer;
      font-size: 12px;
      padding: 4px 10px;
    }
    .close {
      border: none;
      background: none;
      cursor: pointer;
      font-size: 16px;
      color: var(--secondary-text-color);
      padding: 4px 8px;
    }
    video,
    ha-hls-player {
      width: 100%;
      max-height: 60vh;
      border-radius: 8px;
      background: black;
      display: block;
    }
    .player-frame.fixed {
      position: relative;
      width: 100%;
      border-radius: 8px;
      overflow: hidden;
      background: black;
    }
    .player-frame.fixed video,
    .player-frame.fixed ha-hls-player {
      position: absolute;
      inset: 0;
      height: 100%;
      max-height: none;
      object-fit: cover;
      border-radius: 0;
    }
    .empty,
    .error {
      padding: 16px 4px;
      color: var(--secondary-text-color);
    }
    .error {
      color: var(--error-color, #db4437);
    }
    .skeletons {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .skeleton {
      height: var(--mglc-skel-h, 62px);
      border-radius: 8px;
      background: var(--secondary-background-color);
      opacity: 0.6;
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.3;
      }
    }
  `;
}

customElements.define("media-gallery-list-card", MediaGalleryListCard);

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: "media-gallery-list-card",
  name: "Media Gallery List Card",
  description:
    "Newest videos from any media source (UniFi Protect, Synology, local media, ...) with inline playback, grid/list layouts, and kiosk rotation.",
  preview: false,
  documentationURL:
    "https://github.com/stefanschaedeli/media-gallery-list-card",
});
