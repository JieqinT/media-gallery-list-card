# Media Gallery List Card

A Home Assistant Lovelace card that lists the **newest videos from any media source**
— UniFi Protect recordings, Synology Surveillance Station, local media folders,
anything you can see in Home Assistant's Media Browser — and plays them **inline**
on your dashboard.

No integration, no automations, no local file copies: the card talks to the same
`media_source` WebSocket API the built-in Media Browser uses.

## Installation

### HACS (recommended)

1. HACS → three-dot menu → **Custom repositories**
2. Add `https://github.com/stefanschaedeli/media-gallery-list-card` as type **Dashboard**
3. Search for **Media Gallery List Card**, download, and reload your browser

### Manual

Copy `media-gallery-list-card.js` from the latest release to `/config/www/` and add
`/local/media-gallery-list-card.js` as a dashboard resource (type: JavaScript module).

## Configuration

```yaml
type: custom:media-gallery-list-card
media_source: media-source://unifiprotect/xxxxxxxxxxxx:browse:all:smart:recent:1
title: Letzte Aufnahmen
max_items: 3
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `media_source` | string | **required** | A `media-source://…` URI of a browsable folder |
| `max_items` | number | `3` | How many of the newest videos to list (1–20) |
| `title` | string | – | Optional card heading |
| `layout` | `list` \| `grid` | `list` | Rows with side thumbnails, or a tile grid |
| `columns` | number | `3` | Tiles per row in grid layout (1–6, 16:9 tiles) |
| `show_title` | boolean | `true` | Show video titles (list rows / grid captions) |
| `autoplay_rotation` | boolean | `false` | Kiosk mode: play the newest N back-to-back, looping; re-fetches the list each loop. Starts muted (browser policy) with a tap-to-unmute pill |
| `rotation_show_list` | boolean | `false` | With rotation: keep the tappable list below the player (tap = jump to that clip) |
| `refresh_interval` | number | `0` | Auto-refresh the list every N seconds (0 = off) |
| `reverse` | boolean | `false` | Flip item order for sources that sort oldest-first |

### Kiosk example (wall tablet)

```yaml
type: custom:media-gallery-list-card
media_source: media-source://unifiprotect/xxxxxxxxxxxx:browse:all:smart:recent:1
max_items: 5
autoplay_rotation: true
```

### Finding your media-source URI

Open **Media** in the Home Assistant sidebar and navigate to the folder you want
(e.g. UniFi Protect → your console → All Cameras → Smart Detections → Last 24 hours).
The browser URL contains the URI, URL-encoded — the part starting with
`media-source%3A%2F%2F…`. Decode it (`%3A` → `:`, `%2F` → `/`) and use it as
`media_source`.

Example for UniFi Protect "recent smart detections, last 1 day, all cameras":

```
media-source://unifiprotect/<console-id>:browse:all:smart:recent:1
```

## What it looks like

- A flat list of the newest N videos with thumbnails and titles
- Tap a row → the clip plays inline at the top of the card, with a close button
- Friendly empty state ("No recordings" / "Keine Aufnahmen") and readable inline
  errors — the card never dies with a bare "Configuration error"

## Notes

- Playable URLs are resolved on tap (they are short-lived signed URLs).
- HLS streams use Home Assistant's own `ha-hls-player` when available; MP4 plays
  in a native `<video>` element.
- Requires Home Assistant 2024.x or newer (uses `media_source/browse_media`,
  `media_source/resolve_media`, `auth/sign_path`).

## License

MIT
