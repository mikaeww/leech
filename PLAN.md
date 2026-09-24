# Leech — port plan

Leech puts the frontend of [Search](https://github.com/driceroland/Search) (Swift, SwiftUI, by Office Commun) on Chromium, for Linux.
Stack: Electron 44 (Chromium 152), plain HTML/CSS/JS — no framework, no bundler.

Every measurement, animation curve, JS blob and file format of the original is recorded in
[`docs/port-inventory.txt`](docs/port-inventory.txt). This plan only says what goes where and in which order.

## Why Chromium and not WebKit

Leech started on WebKitGTK (phases 0–1, still in the git history). WebKitGTK sends a user agent Google reads as a robot, has no DRM and no extension API. The point of Leech is Search's frontend, not its engine, so the engine is Chromium.

## Principles

- Same look and behaviour as Search. Where the original leans on macOS, take the nearest Linux or Chromium primitive; where there is none, simplify and write it down here.
- The three motion curves are the whole animation vocabulary. Springs become CSS `linear()` easings sampled from the damped oscillator (`ui/motion.js`):
  - `glide`: response 0.34 s, damping 0.82
  - `settle`: response 0.30 s, damping 0.86
  - `quick`: ease-out, 140 ms
- Pages are `<webview>` elements, so everything Leech draws over a page (omnibox, find bar, peeking sidebar, toasts) is plain DOM.
- `main.js` owns what Chromium owns: the window, keys taken before the page, context menus, popups, downloads, permissions, files.
- Data lives in `$XDG_DATA_HOME/leech` (the Chromium profile and Leech's JSON files). Every write is atomic (temp + rename); a file that fails to parse is renamed to `<name>.unreadable-<unix>.json`, never overwritten. Dates are Unix seconds.
- `LEECH_DATA_DIR` points everything at a throwaway folder for testing.

## What changes against the original

| Original | Leech | Why |
|---|---|---|
| WKWebView | Chromium `<webview>` | Google, DRM and extensions work on Chromium |
| Chrome extensions via WKWebExtension + shims | Chromium's own extension support (later phase) | |
| Platform passkeys | Chromium's WebAuthn | |
| Self-updater | AUR package + GitHub Releases | the package manager updates |
| Bench tool, 120 Hz toggle, Sharing, FrameRate | dropped | macOS-only or developer tooling |
| Traffic lights | three small doors (minimize, maximize, close) | Linux has no traffic lights |
| Keychain | libsecret via Electron `safeStorage` | |
| Floating video above every app | Chromium's picture-in-picture window | Wayland clients cannot keep themselves on top |
| Safari user agent | Chrome's user agent without "Electron", plus Chrome's client hints | Google treats an Electron UA, or a Chrome without client hints, as a robot |

### Shortcuts

⌘ becomes Ctrl. Where that collides with a Linux or Chromium convention:

| Action | macOS | Leech |
|---|---|---|
| Switch space | ⌃1–9 | Alt+1–9 |
| Copy address | ⇧⌘C | Ctrl+Alt+C |
| Inspector | ⌥⌘I | Ctrl+Shift+I, F12 |
| Back / forward | ⌘[ ⌘] | Ctrl+[ Ctrl+], Alt+←/→, mouse buttons 4/5 |

## Phases

Each phase ends with a run in a headless X server with screenshots, a commit and a push.

### Phase 0–1 — WebKitGTK prototype ✅ (replaced)

### Phase 2 — Chromium, chrome complete ✅
- `main.js`: frameless window, single instance, keys before the page, page context menu, popups, downloads to `~/Downloads`, permission prompts, clean user agent and client hints.
- `ui/address.js`, `ui/engine.js`, `ui/history.js` (tested in `test/logic.test.mjs`).
- Top strip with the original's tab geometry, sliding pill, reading-progress fill, overflow scrolling, loading ring, speaker, hover cross.
- Sidebar mode (Ctrl+Shift+S): pinned grid, rows, "New tab" row, resize edge (176–440, double-click resets).
- Fold (Ctrl+S) with the column peeking in from the edge.
- Omnibox with inline completion, suggestions, search fallback, Ctrl+K switcher that steps while Ctrl is held.
- Pinning, rename, change letter, address edit in the tab, native tab menu, drag to reorder (strip, rows, pinned grid), reopen closed tabs.
- Find bar, per-host zoom, mute, toasts, inline load-failure view, session and history restore.

Open: Esc only closes Leech's own overlays; the original also stops a loading page on Esc.

### Phase 3 — panels and data
Plate / Card / Line pieces; Settings (look, engine, tabs, sidebar, downloads), History, Downloads, Bookmarks (tree, dropdown, bar); the bottom-bar camera/mic question replacing the native dialog.

### Phase 4 — privacy and passwords
Shield content blocker (the original's rules through `webRequest`, per-host pause), element hiding (picker JS, `hidden.json`, panel), private tabs, form relay, password vault with `safeStorage`, save offer, account list, password panel, import from Chromium / Firefox / Zen / CSV.

### Phase 5 — sleep and spaces
Tab sleeping (30 min, snapshot cover), crash recovery, spaces with their own partitions, space dot, menu, new-space card, swipe paging.

### Phase 6 — extras
Site card, link peek, reading mode, autoscroll, hover link bubble, welcome flow, Chrome extensions, Widevine, default browser, AUR package, first release.
