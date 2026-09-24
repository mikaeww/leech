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


### Phase 3 — panels and data ✅
- `ui/panels.js`: plate, card, line, switch, segmented control and pill, as in Search.
- Settings (Ctrl+,): General (default browser via `xdg-settings`, search engine incl. custom, appearance, link bubble), Tabs, Downloads (folder, ask each time), Privacy (shield on/off and per site, forget camera/mic answers, clear history/cookies/cache), About with the shortcuts.
- History (Ctrl+H): search, grouped by day, remove, clear card.
- Downloads (Ctrl+J): list kept by main in `downloads.json`, open, show in folder, remove, clear list.
- Bookmarks: Ctrl+Shift+B adds, panel (Ctrl+Shift+O) with folders, move, rename, remove, import from Chrome/Chromium/Brave/Vivaldi/Edge; dropdown behind the bookmark door; bookmarks bar.
- Menu door (⋯) for what the macOS menu bar did.
- Camera/microphone/location question as the original's bottom bar, remembered per site.
- Shield moved up from phase 4: the original's 44 hosts blocked as third parties, its hide rules injected per page, paused per site.
- Esc now also stops a loading page.

### Phase 4 — privacy and passwords ✅
- Private tabs (Ctrl+Shift+N): each in its own in-memory partition, marked with the crossed eye, never in the session, history or zoom memory; tabs and links opened from one stay private.
- Element hiding (Ctrl+Shift+H): the original's picker, ported into the page's isolated world; `hidden.json` kept by main so the stylesheet goes in before the page draws; Ctrl+Z undo, hint bar, "Hidden on this site" panel (Ctrl+Shift+U) with peek-on-hover and restore.
- Sign-ins: the original's form relay; offer to save after a sign-in worked (save / not now / never here), account list hanging from the sign-in box, fill through the field's own setter.
- `vault.js`: passwords sealed with Electron `safeStorage` in the desktop keyring (Leech forces Chromium's libsecret store, which it wouldn't pick on Hyprland by itself).
- Passwords panel: search, reveal for 15 s, copy, remove, add by hand; settings page for saving, filling and the never list.
- `importers.js`: bookmarks and history from Chrome, Chromium, Brave, Vivaldi, Edge, Zen, Firefox, LibreWolf (read from copies of their files); passwords from the CSV those browsers export.

Deviation: the original reads Chromium's password store directly. Leech takes the CSV export instead — every one of those browsers can export one under its password settings.

### Phase 5 — sleep and spaces ✅
- Tabs sleep after 30 minutes away (hidden `sleep.after` setting in seconds); pinned, playing, loading, typed-in, signing-in and opener tabs stay awake; the picture they fell asleep on covers the page while it comes back.
- Spaces (Settings › Tabs, Alt+1–9, the space icon, two fingers across the column or a wheel notch over the strip): each its own row and session file, signed in with the others or with its own partition, parked rows keep their pages, media paused on leaving; new / rename / icon / move / delete from the space menu.

Limit: a sleeping tab wakes by loading its address again, so its back/forward list is gone. `navigationHistory.restore` only works on a page that never loaded, and a webview only attaches once it has a `src`.

### Phase 6 — extras (in progress)
Done:
- Reading mode (Ctrl+Shift+R): the original's script, run on demand; again reloads the page. Hard reload moved to Ctrl+F5.
- Floating video (Ctrl+Shift+P): the largest playing video goes into Chromium's picture-in-picture window (not yet tried on a real video).
- Link peek (Settings › General): shift-click opens the link in a panel over the page; Esc closes, the arrow keeps it as a tab.

Open: site card under the address field, middle-button autoscroll, welcome flow, the swipe disc, Chrome extensions, Widevine, AUR package and first release.
