# electron

The older shell: Electron 44 running `ui/` with `<webview>` pages. Kept for working on the UI without a
Chromium build, and for headless screenshots.

**For:** what Chromium owns in the Electron shell: the window, keys taken before the page, popups, context
menus, downloads, permission questions, the shield, JSON files, the keyring (`safeStorage`), importing.
**Not for:** the Chromium build, which does all of this in `chromium/leech/` and Chromium itself.

`main.js` only wires; each concept has its file (`store`, `window`, `keys`, `pages`, `session`, `downloads`,
`vault`, `importers`). `preload/window.js` is the UI's `window.leech`; every page gets `ui/guest/page.js`, the page
script both shells share, as its preload.

Test: `npm start`, or `LEECH_DATA_DIR=<empty folder> npm start` for a throwaway profile. `importers.js` has a
unit test in `test/logic.test.mjs`.
