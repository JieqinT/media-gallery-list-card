# Media Gallery List Card

A Home Assistant Lovelace card that shows the **newest videos from any media source**
and plays them **inline** on your dashboard.

![List view — newest recordings with thumbnails](docs/images/list-view.png)

If you can see it in Home Assistant's **Media** browser, this card can show it:

- 📹 NVR / camera recordings — **UniFi Protect**, **Frigate**, **Reolink**,
  **Synology Surveillance Station**, Blue Iris, …
- 💾 Video folders on a NAS or SMB/DLNA share
- 📁 Local media (`/media`, `/config/www`) — dashcam uploads, timelapses,
  clips saved by automations

No integration of its own, no automations, no file copies: the card talks to the same
`media_source` WebSocket API the built-in Media Browser uses, so **any provider works
out of the box** — current and future ones.

## Features

- Flat list of the newest N videos from a folder you pick — zero-click recency
- **List or grid layout** (`columns: 1–6`, 16:9 tiles with caption overlay)
- **Inline playback**: tap a row/tile, the clip plays right in the card
- **Kiosk rotation**: plays the newest N back-to-back and loops — great for wall
  tablets (starts muted per browser policy, tap-to-unmute)
- **Built-in source browser**: click through the media tree in the card editor and
  pick your folder — no URI hand-editing
- Signed thumbnails, empty state, readable inline errors, English/German UI

**Inline playback** — tap a row, the clip plays right there:

![Inline player](docs/images/inline-player.png)

**Kiosk rotation** — clips play back-to-back with position indicator and tap-to-unmute:

![Kiosk rotation player](docs/images/rotation-player.png)

## Installation

### HACS (recommended)

1. HACS → three-dot menu → **Custom repositories**
2. Add `https://github.com/stefanschaedeli/media-gallery-list-card` as type **Dashboard**
3. Search for **Media Gallery List Card**, download, and reload your browser

### Manual

Copy `media-gallery-list-card.js` from the latest release to `/config/www/` and add
`/local/media-gallery-list-card.js` as a dashboard resource (type: JavaScript module).

## Quick start

Add the card via the dashboard's **Add Card** dialog, click **📂 Browse** next to the
media source field, click down to the folder you want, and hit **✓ Use this folder**.
Done — the card lists that folder's newest videos.

## Configuration

```yaml
type: custom:media-gallery-list-card
media_source: media-source://…   # pick it with the built-in browser
title: Latest clips
max_items: 3
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `media_source` | string | **required** | A `media-source://…` URI of a browsable folder — use the editor's 📂 Browse button |
| `max_items` | number | `3` | How many of the newest videos to list (1–20) |
| `title` | string | – | Optional card heading |
| `layout` | `list` \| `grid` | `list` | Rows with side thumbnails, or a tile grid |
| `columns` | number | `3` | Tiles per row in grid layout (1–6, 16:9 tiles) |
| `show_title` | boolean | `true` | Show video titles (list rows / grid captions) |
| `autoplay_rotation` | boolean | `false` | Kiosk mode: play the newest N back-to-back, looping; re-fetches the list each loop. Starts muted (browser policy) with a tap-to-unmute pill |
| `rotation_show_list` | boolean | `false` | With rotation: keep the tappable list below the player (tap = jump to that clip) |
| `refresh_interval` | number | `0` | Auto-refresh the list every N seconds (0 = off) |
| `reverse` | boolean | `false` | Flip item order for sources that sort oldest-first |

## Examples

**Security recordings, tile wall (UniFi Protect shown — any NVR provider works the same):**

```yaml
type: custom:media-gallery-list-card
title: Letzte Aufnahmen
media_source: media-source://unifiprotect/xxxxxxxxxxxx:browse:all:smart:recent:1
max_items: 6
layout: grid
columns: 3
```

**Kiosk player for a wall tablet (loops the newest clips, picks up new ones automatically):**

```yaml
type: custom:media-gallery-list-card
media_source: media-source://frigate/frigate/event/clips/all/all/recent/1
max_items: 5
autoplay_rotation: true
```

**Newest clips from a local folder (e.g. saved by an automation or synced from a dashcam):**

```yaml
type: custom:media-gallery-list-card
title: Dashcam
media_source: media-source://media_source/local/dashcam
max_items: 3
show_title: false
```

### Finding a media-source URI manually

The editor's **📂 Browse** button is the easy way. If you prefer doing it by hand:
open **Media** in the sidebar and navigate to your folder — the page URL contains the
URI, URL-encoded (the part starting with `media-source%3A%2F%2F…`). Decode it
(`%3A` → `:`, `%2F` → `/`) and use it as `media_source`.

## Notes

- Playable URLs are resolved on tap (they are short-lived signed URLs).
- HLS streams use Home Assistant's own `ha-hls-player` when available; MP4 plays in a
  native `<video>` element.
- The card lists the *videos directly inside* the configured folder (no recursion) —
  pick the folder that already aggregates what you want to see (most NVR providers
  offer "recent" folders exactly for this).
- Requires Home Assistant 2024.x or newer (uses `media_source/browse_media`,
  `media_source/resolve_media`, `auth/sign_path`).

## License

MIT
