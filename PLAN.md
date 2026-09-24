# Leech — port plan

Leech is a near 1:1 Linux port of [Search](https://github.com/driceroland/Search) (Swift, SwiftUI, WKWebView) by Office Commun.
Stack: Rust, gtk4-rs 0.11, libadwaita 0.9, webkit6 0.6 (WebKitGTK 6.0, 2.52+), libsecret.

Every measurement, animation curve, JS blob and file format of the original is recorded in
[`docs/port-inventory.txt`](docs/port-inventory.txt). This plan only says what goes where and in which order.

## Principles

- Same engine family (WebKit), same look, same behaviour. Where the original leans on macOS, take the nearest Linux primitive; where there is none, simplify and write it down here.
- One file per concern, as in the original. Port a Swift file to a Rust module of the same name (lowercase).
- The three motion curves are the whole animation vocabulary:
  - `glide`: spring, damping 0.82, stiffness 341.5 (response 0.34 s)
  - `settle`: spring, damping 0.86, stiffness 438.6 (response 0.30 s)
  - `quick`: ease-out cubic, 140 ms
- The JavaScript the original injects is copied verbatim into `src/js/*.js` and runs in an isolated script world named `leech`.
- Data lives in `$XDG_DATA_HOME/leech`, settings in `$XDG_CONFIG_HOME/leech/settings.json`. Every write is atomic (temp + rename); a file that fails to parse is renamed to `<stem>.unreadable-<unix>.json`, never overwritten. Dates are Unix seconds.
- `LEECH_DATA_DIR` points data, config and WebKit storage at a throwaway folder for testing.

## What changes against the original

| Original | Leech | Why |
|---|---|---|
| Chrome extensions (WKWebExtension + 3,000 lines of shims) | dropped in v1 | WebKitGTK has no extension API |
| Platform passkeys (ASAuthorization) | whatever WebKitGTK does natively | no platform authenticator on Linux |
| Self-updater with signature check | AUR package + GitHub Releases | the package manager updates |
| Bench tool, 120 Hz toggle, Sharing, FrameRate | dropped | macOS-only or developer tooling |
| Traffic lights, drag strip | GtkWindowHandle + GtkWindowControls | native CSD |
| Keychain | libsecret (schema `app.leech.Password`) | |
| Password import: Chromium + CSV | Chromium (v10 + v11 via libsecret) + Firefox/Zen + CSV | Firefox/Zen is new code |
| Floating video on top of every app | undecorated window; pin it with a Hyprland rule | Wayland clients cannot keep themselves on top |
| Custom two-finger swipe with a disc | WebKitGTK's built-in back/forward gesture first; the disc later | |
| No DRM | — | WebKitGTK ships no Widevine: Netflix, Disney+ won't play |

### Shortcuts

⌘ becomes Ctrl. Where that collides with a Linux or WebKitGTK convention:

| Action | macOS | Leech |
|---|---|---|
| Switch space | ⌃1–9 | Alt+1–9 |
| Copy address | ⇧⌘C | Ctrl+Alt+C (Ctrl+Shift+C stays WebKit's inspect) |
| Paste and go | ⇧⌘V | Ctrl+Shift+V only when no field has focus |
| Inspector / console / inspect | ⌥⌘I / J / C | Ctrl+Shift+I / J / C |
| Back / forward | ⌘[ ⌘] | Ctrl+[ Ctrl+] and Alt+Left / Alt+Right |

## Phases

Each phase ends with a build, a run in a headless X server with screenshots, a commit and a push.

### Phase 0 — skeleton ✅
Cargo project, window with one web view, licence, this plan.

### Phase 1 — window, tabs, omnibox
- `app.rs`: AdwApplication (HANDLES_OPEN, single instance), window 1180×780 / min 640×420, client-side, GtkWindowHandle.
- `design.rs` + `style.css`: palette (light/dark), radii, fonts, `glide` / `settle` / `quick` helpers.
- `store.rs`: atomic JSON read/write with quarantine; `prefs.rs`: settings file with defaults.
- `tab.rs`: tab model, lazy WebView, one NetworkSession, notify bindings (title, uri, progress, loading, back/forward).
- `tabbar.rs`: 52 px strip, tab geometry exactly as the original, sliding live pill (glide), helm (back/forward/reload), plus button.
- `address.rs` (text → URL, with a test), `engine.rs`, `history.rs` (record, frecency, completion).
- `omnibox.rs`: 560×50 field, inline completion, suggestion list, shake on refusal, breath glow.
- `browser.rs`: new/close/select tab, decide-policy rules, load-failed messages, the main shortcuts (T W L K R [ ] 1–9, Ctrl+Tab, Esc).
- `session.rs`: save (debounced 1.2 s) and restore with sleeping tabs.

### Phase 2 — chrome complete
Sidebar mode (resize edge, pinned grid, rows), Ctrl+Shift+S toggle, pinning, rename, in-place address edit, tab menu, drag to reorder, reopen closed tabs, find bar, per-host zoom, mute, loading ring, toasts, error view.

### Phase 3 — panels and data
Plate / Card / Line widgets; History, Downloads, Bookmarks (tree, dropdown, bar); Settings panel with segmented control, switch and pill; script dialogs, file chooser, TLS prompt, HTTP auth, camera/mic permission.

### Phase 4 — privacy and passwords
Shield content blocker (same JSON rules, per-host pause), element hiding (picker JS, `hidden.json`, panel), form relay, libsecret vault, save offer, account list, password panel, import from Chromium / Firefox / Zen / CSV, private tabs.

### Phase 5 — sleep and spaces
Tab sleeping (30 min, snapshot cover, session state, memory monitor), crash recovery, spaces with their own network session, space dot, menu, new-space card, swipe paging.

### Phase 6 — extras
Fold and peek column, site card, link peek, floating video, reading mode, autoscroll, hover link bubble, welcome flow, swipe disc, default browser, `.desktop` file, AUR package, first release.
