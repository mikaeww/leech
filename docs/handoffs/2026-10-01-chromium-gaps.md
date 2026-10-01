# 2026-10-01: What the Chromium build lacked

Hand-off for the next agent. Historical: the state at the end of this session.

## Asked

Fix everything that was dead in the Chromium build, and from what was missing: splits across a restart, a
sleeping tab's back and forward, a tab's own address field. Plan: [plans/2026-10-01-chromium-gaps.md](../plans/2026-10-01-chromium-gaps.md).

## Done (each committed and pushed)

- 0f923a2: the page script runs in the Chromium build (ADR 0005): `ui/guest/page.js` for both shells,
  `chromium/leech/page/leech_guest.cc` injects it into Chrome's internal isolated world on commit and long-polls a
  promise; one line of Blink awaits it. `check:ui --chromium` exists.
- 5b51822: hidden elements are the UI's (`places/hidden.js`), the shield's list moved to `places/shield.js`, the
  page script applies both sheets; Ctrl+Z while picking in the Chromium build. Fixed the Electron shell's Esc and
  Ctrl+Z from inside a page (wrong IPC channel since the restructure). The UI check runs its own Xvfb and types
  real keys (xdotool).
- 20a3afc: sleep through Chromium's discard (`page/leech_sleep.cc`), history kept; archive works there; Clear
  keeps pages with typed input; titles after back/forward fixed in the Chromium build; tabs Chromium opens are no
  longer loaded twice.
- d7cca2c: link peek in the Chromium build (`page/leech_peek.cc`, a WebView under the UI in the frame's hole).
- c978825: Chromium's bubbles that hang from the omnibox (save password, ...) hang from the stage's top right.
- a8c4ae2: the shield blocks in the Chromium build (ADR 0006, DNR rules of a component extension).
- 3e908e3: splits in the session. aafb047: inline completion in a tab's address field.
- Last commit: the `opened-tab` scenario and this hand-off.

`npm run check:ui` runs 19 scenarios in Electron, `-- --chromium` 20 in the Chromium build; all passed.

## Not done, on purpose or known

- Electron only: a page that commits while a UI field has focus takes the focus back (electron/README.md). The
  Chromium build keeps it, checked.
- The page script runs after commit (a page can draw once without its hidden-element sheet) and not in frames.
- The shield sets no rules for private windows; third party is Chromium's reading (public suffix list).
- A peeked page drops the popups it opens; in the Chromium build a private tab's peek uses the normal profile.
- History restored after a restart is still the address only (only sleep keeps back and forward).
- Not done from the earlier list: middle-button autoscroll, the swipe disc, Widevine, AUR package and release.

## For the owner

The Chromium binary was rebuilt; a running Leech keeps the old one until every window is closed with Ctrl+Q.
