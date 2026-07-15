import { LitElement, html, nothing, css, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import type { HomeAssistant, MediaGalleryListCardConfig } from "./types";
import { MAX_COLUMNS, MAX_MAX_ITEMS } from "./types";
import "./source-picker";

const SCHEMA = [
  { name: "title", selector: { text: {} } },
  {
    name: "max_items",
    selector: { number: { min: 1, max: MAX_MAX_ITEMS, mode: "box" } },
  },
  {
    name: "layout",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "list", label: "List" },
          { value: "grid", label: "Grid" },
        ],
      },
    },
  },
  {
    name: "columns",
    selector: { number: { min: 1, max: MAX_COLUMNS, mode: "box" } },
  },
  { name: "show_title", selector: { boolean: {} } },
  { name: "autoplay_rotation", selector: { boolean: {} } },
  { name: "rotation_show_list", selector: { boolean: {} } },
  {
    name: "refresh_interval",
    selector: { number: { min: 0, max: 3600, mode: "box", unit_of_measurement: "s" } },
  },
  { name: "reverse", selector: { boolean: {} } },
];

const LABELS: Record<string, string> = {
  title: "Title (optional)",
  max_items: "Number of videos to show",
  layout: "Layout",
  columns: "Grid columns (grid layout only)",
  show_title: "Show video titles",
  autoplay_rotation: "Auto-playback rotation (kiosk mode, starts muted)",
  rotation_show_list: "Show list below rotation player",
  refresh_interval: "Auto-refresh interval (seconds, 0 = off)",
  reverse: "Reverse order (for oldest-first sources)",
};

class MediaGalleryListCardEditor extends LitElement {
  public hass?: HomeAssistant;
  @state() private _config?: MediaGalleryListCardConfig;
  @state() private _browsing = false;

  public setConfig(config: MediaGalleryListCardConfig): void {
    this._config = config;
  }

  private _emitConfig(config: MediaGalleryListCardConfig): void {
    this._config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _formChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    this._emitConfig({ ...this._config, ...ev.detail.value });
  }

  private _sourceTyped(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this._emitConfig({ ...this._config!, media_source: value });
  }

  private _sourceSelected(ev: CustomEvent): void {
    ev.stopPropagation();
    this._browsing = false;
    this._emitConfig({
      ...this._config!,
      media_source: ev.detail.media_content_id,
    });
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    return html`
      <div class="source">
        <label class="source-label">Media source URI (media-source://…)</label>
        <div class="source-row">
          <input
            class="source-input"
            type="text"
            .value=${this._config.media_source ?? ""}
            placeholder="media-source://…"
            @change=${this._sourceTyped}
          />
          <button
            class="browse ${this._browsing ? "active" : ""}"
            @click=${() => (this._browsing = !this._browsing)}
          >
            ${this._browsing ? "▲" : "📂"} Browse
          </button>
        </div>
        ${this._browsing
          ? html`<media-gallery-source-picker
              .hass=${this.hass}
              @source-selected=${this._sourceSelected}
            ></media-gallery-source-picker>`
          : nothing}
      </div>
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${SCHEMA}
        .computeLabel=${(s: { name: string }) => LABELS[s.name] ?? s.name}
        @value-changed=${this._formChanged}
      ></ha-form>
    `;
  }

  static styles = css`
    .source {
      margin-bottom: 16px;
    }
    .source-label {
      display: block;
      font-size: 12px;
      color: var(--secondary-text-color);
      margin-bottom: 4px;
    }
    .source-row {
      display: flex;
      gap: 8px;
    }
    .source-input {
      flex: 1;
      min-width: 0;
      padding: 10px 8px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      font: inherit;
      font-size: 14px;
    }
    .browse {
      flex-shrink: 0;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      cursor: pointer;
      padding: 0 12px;
      font: inherit;
      font-size: 14px;
    }
    .browse.active {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      border-color: var(--primary-color);
    }
  `;
}

customElements.define(
  "media-gallery-list-card-editor",
  MediaGalleryListCardEditor
);
