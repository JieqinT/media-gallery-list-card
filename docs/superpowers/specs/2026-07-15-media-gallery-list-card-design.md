# Design: media-gallery-list-card

## Problem

Home Assistant has no dashboard card that shows the newest recordings from a
remote media library (e.g. `media-source://unifiprotect/…`) inline. Existing
gallery cards only read local folders or provider-specific APIs (Frigate,
Reolink). Workarounds (automations copying clips to local storage) are
overcomplicated and fragile.

## Solution

A small Lovelace card using the same WebSocket API as the built-in Media
Browser:

- `media_source/browse_media` → list a configured folder URI
- `media_source/resolve_media` → playable URL on tap
- `auth/sign_path` → sign relative thumbnail/media paths

v1 scope (user-confirmed): flat list of the newest N playable videos from one
configured `media-source://` URI, inline player with close button, no tree
navigation.

## Config

```yaml
type: custom:media-gallery-list-card
media_source: media-source://…   # required
max_items: 3                     # 1–20, default 3
title: ""                        # optional
refresh_interval: 0              # seconds; 0 = off
reverse: false                   # flip order for oldest-first providers
```

## Architecture

| Unit | Purpose | Depends on |
| --- | --- | --- |
| `src/types.ts` | Config + HA API types, constants | – |
| `src/ha-api.ts` | `browseMedia`, `resolveMedia`, `signPathIfNeeded` (with short-lived cache) | `types` |
| `src/media-gallery-list-card.ts` | Lit card: load list, render rows, inline player, states | `ha-api`, `types`, `editor` |
| `src/editor.ts` | `ha-form`-based visual editor | `types` |

Data flow: `setConfig`/`connectedCallback`/interval → browse → filter
`can_play` + video class → optional reverse → slice N → sign thumbnails →
render. Tap → resolve → sign → play (HLS via `ha-hls-player` when registered,
else native `<video>`).

Error philosophy: `setConfig` throws early with precise messages (that's the
only place HA renders config errors well); everything else renders inline
error text — never an unexplained dead card.

## Packaging

TypeScript + Lit + rollup → single `dist/media-gallery-list-card.js`. HACS
dashboard plugin (`hacs.json`), MIT, GitHub release workflow attaches the
bundle. Repo: `stefanschaedeli/media-gallery-list-card`.

## Testing

- `npm run typecheck` + `npm run build` clean
- Live: newest-3 renders for UniFi Protect recent-smart-detections URIs, tap
  plays inline, close returns, bogus URI → readable error, empty folder →
  empty state
- HACS custom-repo install verified on the live instance
