# chromium

Leech's side of its Chromium build (154.0.8037.57).

**For:** `chrome://leech` over the whole window (`leech/leech_view.*`), the UI's bridge to tabs, files and the
window (`leech/leech_ui.cc`), reporting each page's events to the UI (`leech/leech_tab_watch.*`), and the
services the UI asks for (`leech/services/`): split view on Chromium's own side-by-side (the patch quiets its pane
outline, mini toolbar and padding and paints the gap in the UI's `--bg`), search suggestions, extensions
(their actions run from the UI's door, popups hanging from it), and Chromium's settings through a fixed list
(`leech_prefs.cc`, ADR 0004). `leech/passwords/` gives the UI's Passwords panel Chromium's password store:
list, reveal, add, change, remove, import a CSV (ADR 0011). `leech/files/` reads and writes Leech's JSON files in
the profile. `leech/downloads/` sorts downloads into a folder of their kind with the UI's table, asked by one
call in Chromium's `download_target_determiner.cc`, and gives the UI's Downloads panel Chromium's download list. `leech/sandbox/` opens a page in a window on a fresh
off-the-record profile and destroys the profile with its last window (ADR 0012), and reports to the sandbox
panel what the sandbox holds against the normal profile; the link menu's "Open Link in Sandbox" is in the patch.
`leech/tabs/` carries out what the UI asks of one tab. `leech/dev/` is the Dev UI's DevTools protocol client on the
tab on screen (ADR 0013); `leech/files/leech_folder.*` gives its Explorer a folder the owner chose, and nothing else. `leech/page/` runs the page script (`ui/guest/`) in every page and carries its
messages (ADR 0005), puts tabs to sleep through Chromium's discard, shows a peeked link in a page of its own
under the UI, and blocks the shield's hosts through declarativeNetRequest (ADR 0006).
**Not for:** the UI itself, which lives in `ui/` and is served from disk at run time.

Chromium's own toolbar and tab strip stay alive but take no room (`LeechView::AfterLayout`); the toolbar is a point
at the stage's top right, where bubbles hanging from the omnibox appear.

- `leech/` is symlinked into the checkout as `src/chrome/browser/ui/leech`.
- `patches/` is the rest of Chromium that has to change, made with `git diff` in the checkout, one file per
  subject: `addresses.patch` (`git diff -- components/autofill`) encrypts saved addresses like card numbers
  (ADR 0010); `leech.patch` (`git diff -- . ':(exclude)components/autofill'`) is the rest: beside
  `chrome/browser/ui`, one line of Blink (a promise is awaited on the isolated-world script path) and one of
  the component-extension allowlist (the shield's id).
- `args.gn` goes to `out/Leech/`; `args-release.gn` (static, Widevine) goes to `out/Release/`, the build
  `tools/stage.mjs` lays out for installing.

Build and run: see "Building" in the top README. After a change here, `autoninja -C out/Leech chrome`
rebuilds only what changed.
