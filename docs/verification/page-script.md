# Verification: the page script

Component: `ui/guest/` (the script), `chromium/leech/page/leech_guest.*` (running it in the Chromium build),
`ui/native.js` (`send`), the Electron webview preload. Decision: [ADR 0005](../decisions/0005-page-script-in-chromium.md).

## Claims

1. On every http(s) page of either shell the script runs and its messages reach the UI as `ipc-message`.
2. What the UI sends a page (`webview.send` / `LeechView.send`) reaches the script's listeners.
3. The page's own scripts can't see the script's channel.
4. Reading progress follows the page's scroll; typed, unsent input is reported as such, and its absence too.

## Oracles

- Claims 1, 2 and 4: the page's real state, read through the page's own DevTools target (scroll position, the
  box's value), set by real input sent to that target; the UI's state read through the UI's target. The two
  targets share no code with the script.
- Claim 3: `typeof globalThis.leechHost` evaluated in the page's main world.

## Method and corpus

Example tests in `npm run check:ui` (`page-script`, both shells with `--chromium`): a local page taller than
the window with one text box. Scroll to the end: reading > 0.9. Ask for unsent input: no. Click into the box and
type: yes. Claim 2 is carried by the question about unsent input, which goes UI to page and answers back.

Threshold: every assertion in the scenario, in both shells.

## Results

2026-10-01, Electron 44.4.5 and the Chromium 154.0.8037.57 build, private Xvfb: `page-script` passed in both.

## Known gaps

- Frames inside a page get no script (as in Electron).
- The script runs after commit; a page can draw once before it.
