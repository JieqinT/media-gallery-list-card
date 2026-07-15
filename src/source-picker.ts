import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { browseMedia } from "./ha-api";
import type { HomeAssistant, MediaBrowseItem } from "./types";

interface Crumb {
  title: string;
  /** undefined = media-source root (not selectable as a card source). */
  mediaContentId?: string;
}

const STRINGS: Record<string, Record<string, string>> = {
  en: {
    use_folder: "✓ Use this folder",
    browse_error: "Could not browse",
    empty_folder: "No subfolders here",
    items: "items",
    root: "Media sources",
  },
  de: {
    use_folder: "✓ Diesen Ordner verwenden",
    browse_error: "Durchsuchen fehlgeschlagen",
    empty_folder: "Keine Unterordner",
    items: "Elemente",
    root: "Medienquellen",
  },
};

/**
 * Inline click-through browser for the media-source tree.
 * Fires "source-selected" (detail: {media_content_id}) when the user
 * picks the currently open folder.
 */
class MediaGallerySourcePicker extends LitElement {
  public hass?: HomeAssistant;

  @state() private _stack: Crumb[] = [];
  @state() private _children: MediaBrowseItem[] = [];
  @state() private _loading = false;
  @state() private _error?: string;

  public connectedCallback(): void {
    super.connectedCallback();
    if (!this._stack.length) {
      void this._browseTo({ title: this._t("root"), mediaContentId: undefined }, 0);
    }
  }

  private _t(key: string): string {
    const lang = this.hass?.locale?.language ?? this.hass?.language ?? "en";
    return STRINGS[lang.split("-")[0]]?.[key] ?? STRINGS.en[key] ?? key;
  }

  private async _browseTo(crumb: Crumb, depth: number): Promise<void> {
    if (!this.hass) return;
    this._loading = true;
    this._error = undefined;
    try {
      const result = await browseMedia(this.hass, crumb.mediaContentId);
      this._stack = [...this._stack.slice(0, depth), crumb];
      this._children = result.children ?? [];
    } catch (err) {
      this._error = `${this._t("browse_error")}: ${
        err instanceof Error ? err.message : String(err)
      }`;
    } finally {
      this._loading = false;
    }
  }

  private _select(): void {
    const current = this._stack[this._stack.length - 1];
    if (!current?.mediaContentId) return;
    this.dispatchEvent(
      new CustomEvent("source-selected", {
        detail: { media_content_id: current.mediaContentId },
        bubbles: true,
        composed: true,
      })
    );
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    const current = this._stack[this._stack.length - 1];
    const folders = this._children.filter((c) => c.can_expand);
    const leaves = this._children.length - folders.length;
    return html`
      <div class="picker">
        <div class="crumbs">
          ${this._stack.map(
            (crumb, i) => html`
              ${i > 0 ? html`<span class="sep">›</span>` : nothing}
              <button
                class="crumb ${i === this._stack.length - 1 ? "current" : ""}"
                @click=${() => this._browseTo(crumb, i)}
              >
                ${crumb.title}
              </button>
            `
          )}
        </div>
        ${this._error ? html`<div class="error">${this._error}</div>` : nothing}
        ${this._loading
          ? html`<div class="loading"><span class="spinner"></span></div>`
          : html`
              <div class="list">
                ${folders.map(
                  (item) => html`
                    <button
                      class="folder"
                      @click=${() =>
                        this._browseTo(
                          { title: item.title, mediaContentId: item.media_content_id },
                          this._stack.length
                        )}
                    >
                      <span class="icon">📁</span>
                      <span class="name">${item.title}</span>
                      <span class="chev">›</span>
                    </button>
                  `
                )}
                ${!folders.length && !leaves
                  ? html`<div class="hint">${this._t("empty_folder")}</div>`
                  : nothing}
                ${leaves > 0
                  ? html`<div class="hint">🎬 ${leaves} ${this._t("items")}</div>`
                  : nothing}
              </div>
              ${current?.mediaContentId
                ? html`<button class="use" @click=${this._select}>
                    ${this._t("use_folder")}
                  </button>`
                : nothing}
            `}
      </div>
    `;
  }

  static styles = css`
    .picker {
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      padding: 8px;
      margin-top: 8px;
    }
    .crumbs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px;
      margin-bottom: 8px;
    }
    .crumb {
      border: none;
      background: none;
      cursor: pointer;
      color: var(--primary-color);
      padding: 2px 4px;
      font: inherit;
      font-size: 13px;
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .crumb.current {
      color: var(--primary-text-color);
      font-weight: 500;
      cursor: default;
    }
    .sep {
      color: var(--secondary-text-color);
      font-size: 13px;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 260px;
      overflow-y: auto;
    }
    .folder {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      border: none;
      border-radius: 6px;
      background: none;
      cursor: pointer;
      padding: 8px 6px;
      text-align: left;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 14px;
    }
    .folder:hover,
    .folder:focus-visible {
      background: var(--secondary-background-color);
    }
    .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chev {
      color: var(--secondary-text-color);
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: 13px;
      padding: 6px;
    }
    .use {
      width: 100%;
      margin-top: 8px;
      border: none;
      border-radius: 6px;
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      cursor: pointer;
      padding: 8px;
      font: inherit;
      font-size: 14px;
    }
    .error {
      color: var(--error-color, #db4437);
      font-size: 13px;
      padding: 4px 6px;
    }
    .loading {
      display: flex;
      justify-content: center;
      padding: 16px;
    }
    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--divider-color, #e0e0e0);
      border-top-color: var(--primary-color);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;
}

customElements.define("media-gallery-source-picker", MediaGallerySourcePicker);
