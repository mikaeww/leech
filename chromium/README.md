# chromium

Leech's side of its Chromium build (154.0.8037.57).

**For:** `chrome://leech` over the whole window (`leech/leech_view.*`), the UI's bridge to tabs, files and the
window (`leech/leech_ui.cc`), and reporting each page's events to the UI (`leech/leech_tab_watch.*`).
**Not for:** the UI itself, which lives in `ui/` and is served from disk at run time.

- `leech/` is symlinked into the checkout as `src/chrome/browser/ui/leech`.
- `patches/leech.patch` is the rest of Chromium that has to change, made with `git diff` in the checkout.
- `args.gn` goes to `out/Leech/`.

Build and run: see "Building" in the top README. After a change here, `autoninja -C out/Leech chrome`
rebuilds only what changed.
