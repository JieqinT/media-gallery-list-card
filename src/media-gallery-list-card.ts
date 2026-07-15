import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { browseMedia, resolveMedia, signPathIfNeeded } from "./ha-api";
import {
  DEFAULT_MAX_ITEMS,
  MAX_MAX_ITEMS,
  type HomeAssistant,
  type MediaBrowseItem,
  type MediaGalleryListCardConfig,
} from "./types";
import "./editor";

interface ListedItem {
  item: MediaBrowseItem;
  thumbnailUrl?: string;
}

interface PlayingItem {
  title: string;
  url: string;
  mimeType: string;
}

const STRINGS: Record<string, Record<string, string>> = {
  en: {
    no_media_source: "Set “media_source” to a media-source:// URI",
    no_items: "No recordings",
    load_error: "Could not load media list",
    play_error: "Could not play this item",
    close: "Close",
  },
  de: {
    no_media_source: "„media_source“ auf eine media-source:// URI setzen",
    no_items: "Keine Aufnahmen",
    load_error: "Medienliste konnte nicht geladen werden",
    play_error: "Dieses Element konnte nicht abgespielt werden",
    close: "Schließen",
  },
};

class MediaGalleryListCard extends LitElement {
  private _hass?: HomeAssistant;
  private _config?: MediaGalleryListCardConfig;
  private _refreshTimer?: number;
  private _loadedFor?: string;

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
    this._config = config;
    this._loadedFor = undefined;
    this._playing = undefined;
    this._scheduleRefreshTimer();
    this._maybeLoad();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._maybeLoad();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    // Re-fetch when the card returns to view (tab switch, etc.).
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
    const lang =
      this._hass?.locale?.language ?? this._hass?.language ?? "en";
    return STRINGS[lang.split("-")[0]]?.[key] ?? STRINGS.en[key] ?? key;
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
          return { item, thumbnailUrl };
        })
      );
      this._items = items;
    } catch (err) {
      this._error = `${this._t("load_error")}: ${
        err instanceof Error ? err.message : String(err)
      }`;
      this._items = [];
    } finally {
      this._loading = false;
    }
  }

  private async _play(listed: ListedItem): Promise<void> {
    if (!this._hass) return;
    try {
      const resolved = await resolveMedia(
        this._hass,
        listed.item.media_content_id
      );
      const url = await signPathIfNeeded(this._hass, resolved.url);
      this._playing = {
        title: listed.item.title,
        url,
        mimeType: resolved.mime_type,
      };
    } catch (err) {
      this._error = `${this._t("play_error")}: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  private _closePlayer(): void {
    this._playing = undefined;
  }

  private _renderPlayer(playing: PlayingItem): TemplateResult {
    const isHls =
      playing.mimeType === "application/x-mpegURL" ||
      playing.mimeType === "application/vnd.apple.mpegurl";
    const haHlsAvailable = isHls && !!customElements.get("ha-hls-player");
    return html`
      <div class="player">
        <div class="player-bar">
          <span class="player-title">${playing.title}</span>
          <button
            class="close"
            aria-label=${this._t("close")}
            @click=${this._closePlayer}
          >
            ✕
          </button>
        </div>
        ${haHlsAvailable
          ? // ha-hls-player is HA's own HLS wrapper; falls back below if absent.
            html`<ha-hls-player
              .hass=${this._hass}
              .url=${playing.url}
              controls
              autoplay
              playsinline
            ></ha-hls-player>`
          : html`<video
              src=${playing.url}
              controls
              autoplay
              playsinline
            ></video>`}
      </div>
    `;
  }

  private _renderRow(listed: ListedItem): TemplateResult {
    return html`
      <button class="row" @click=${() => this._play(listed)}>
        ${listed.thumbnailUrl
          ? html`<img class="thumb" src=${listed.thumbnailUrl} alt="" />`
          : html`<div class="thumb placeholder" aria-hidden="true">▶</div>`}
        <span class="row-title">${listed.item.title}</span>
      </button>
    `;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    return html`
      <ha-card>
        ${this._config.title
          ? html`<h1 class="card-header">${this._config.title}</h1>`
          : nothing}
        <div class="content">
          ${this._error ? html`<div class="error">${this._error}</div>` : nothing}
          ${this._playing ? this._renderPlayer(this._playing) : nothing}
          ${this._loading && !this._items.length
            ? html`<div class="skeletons">
                ${Array.from(
                  { length: this._config.max_items ?? DEFAULT_MAX_ITEMS },
                  () => html`<div class="skeleton"></div>`
                )}
              </div>`
            : nothing}
          ${!this._loading && !this._error && !this._items.length
            ? html`<div class="empty">${this._t("no_items")}</div>`
            : nothing}
          <div class="rows">${this._items.map((i) => this._renderRow(i))}</div>
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
      height: 54px;
      flex-shrink: 0;
      border-radius: 6px;
      object-fit: cover;
      background: var(--secondary-background-color);
    }
    .thumb.placeholder {
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
      height: 62px;
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
    "Newest videos from any media source (UniFi Protect, Synology, local media, ...) with inline playback.",
  preview: false,
  documentationURL:
    "https://github.com/stefanschaedeli/media-gallery-list-card",
});
