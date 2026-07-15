import { LitElement, html, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import type { HomeAssistant, MediaGalleryListCardConfig } from "./types";
import { MAX_MAX_ITEMS } from "./types";

const SCHEMA = [
  { name: "media_source", required: true, selector: { text: {} } },
  { name: "title", selector: { text: {} } },
  {
    name: "max_items",
    selector: { number: { min: 1, max: MAX_MAX_ITEMS, mode: "box" } },
  },
  {
    name: "refresh_interval",
    selector: { number: { min: 0, max: 3600, mode: "box", unit_of_measurement: "s" } },
  },
  { name: "reverse", selector: { boolean: {} } },
];

const LABELS: Record<string, string> = {
  media_source: "Media source URI (media-source://…)",
  title: "Title (optional)",
  max_items: "Number of videos to show",
  refresh_interval: "Auto-refresh interval (seconds, 0 = off)",
  reverse: "Reverse order (for oldest-first sources)",
};

class MediaGalleryListCardEditor extends LitElement {
  public hass?: HomeAssistant;
  @state() private _config?: MediaGalleryListCardConfig;

  public setConfig(config: MediaGalleryListCardConfig): void {
    this._config = config;
  }

  private _valueChanged(ev: CustomEvent): void {
    const config = { ...this._config, ...ev.detail.value };
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${SCHEMA}
        .computeLabel=${(s: { name: string }) => LABELS[s.name] ?? s.name}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }
}

customElements.define(
  "media-gallery-list-card-editor",
  MediaGalleryListCardEditor
);
