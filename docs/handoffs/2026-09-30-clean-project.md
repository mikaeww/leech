# 2026-09-30: clean-project restructure and design language

Hand-off for the next agent. Historical: describes the state at the end of this session, not after.

## Task

The owner asked to "fix the UI and the general code with /clean-project" (the `clean-project` skill in
`~/.claude/skills/clean-project`, read it and its `references/design.md` and `references/motion.md`).
Decisions taken with the owner on 2026-09-30:

- Design language: clean-project in full (grey, borderless, no shadows, no pills, no colour), not Search 1:1.
- Token values: derived from Search's greys (Design.swift). See `ui/styles/tokens.css` and ADR 0002.
- Code: full clean-project restructure.
- Electron shell: kept and tidied, it is the dev shell and the headless test bed.

## State

**Nothing is committed.** Staging was refused by the permission classifier; do not work around that. Only
`git mv PLAN.md docs/roadmap.md` sits in the index. The owner commits and pushes themselves, or says so
explicitly (the repo memory allows a commit + push per finished phase, no AI attribution, identity `mikaeww`).
Stage paths explicitly, never `git add -A`.

`npm run check` passes: ESLint (style + limits), `tools/structure.mjs`, `tools/tokens.mjs`, 9 unit tests.

### Phase 1: structure (done, verified)

- `ui/app.js` (2399 lines) split into `ui/{state,elements,keys,app}.js` and `ui/tabs/`, `ui/chrome/`,
  `ui/page/`, `ui/places/`, `ui/look/`, `ui/panels/`, `ui/welcome/`. Map: `ui/README.md`,
  `docs/architecture/overview.md`.
- `main.js`, `preload.js`, `vault.js`, `importers.js`, `ui/guest.js` moved to `electron/` and split
  (`store`, `window`, `keys`, `pages`, `session`, `downloads`, `preload/window.js`, `preload/page.js`).
- `chromium/leech/leech_ui.cc` split: `TabWatch` + `DataURL` now in `leech_tab_watch.{h,cc}`;
  `chromium/patches/leech.patch` regenerated (BUILD.gn lists the new files). Compiled and linked in
  `~/Projekte/Apps/leech-chromium/src/out/Leech` (the checkout's BUILD.gn is edited to match the patch).
- `docs/port-inventory.txt` split into `docs/port-inventory/`. Docs: `docs/README.md`, `conventions.md`,
  `verification.md`, `roadmap.md` (ex PLAN.md), `decisions/0000-0002`, component READMEs, `AGENTS.md`
  (`CLAUDE.md` is a symlink to it).
- Verified before the design phase: Electron and the real Chromium build, pixel-identical to the pre-session
  build after the same key/click sequences (strip, sidebar with pins and folders, all panels, menus, welcome).

Traps found on the way, now rules in `docs/conventions.md`:
- The UI modules import each other in a cycle: cross-module exports must be function declarations, not
  `const` arrows (TDZ at start-up otherwise).
- `history`, `open`, `close`, ... are window globals: ESLint treats them as undefined so a missing import fails
  lint instead of silently calling the browser's own.

### Phase 2: design language (written, not yet looked at)

Done in code:
- New stylesheets `ui/styles/{tokens,base,chrome,page,overlays,controls,panels,welcome}.css`, every value from
  tokens; `tools/tokens.mjs` enforces it (`/* raw: why */` on the same line for exceptions).
- `icon(name, size)` has two sizes (`'small'` 10, default 12) and one stroke; all calls converted.
- `pill()`/`big()` replaced by `action(title, fn, primary)` (`.action`, `.action.primary`).
- Card separators (`.rule`), the pinned/loose divider line, the settings divider, inline font sizes and radii
  removed. Bookmark outline indent via `--depth`.
- Default look is `system` (UI and Electron). `?theme=light|dark` pins the palette of one document.
- Reduced motion: targeted rules in `base.css` and `look/motion.js` `reduced` for JS-driven moves.
- Bugs fixed: the failure page's "Try again" had no handler; the ⋯ menu ignored its position; dead `closeMenu`.
- `#stage webview` has a white background so pages without their own background stay readable in dark mode.

**Not yet verified:** no screenshot of the new design has been looked at. Only `n-strip-light.png` was taken
before the session was interrupted, and it was not reviewed.

## Next steps, in order

1. Screenshots of the new UI, both themes, in a private Xvfb (see "How to test"): strip, sidebar with pins and
   folders, blank tab with the address field, address field over a page with suggestions, a menu, settings
   (every rail page), history, bookmarks dropdown, find with no match, a toast, welcome pages. Look at each
   against the No-Go list in `references/design.md`: equal padding on all sides, icon ≤ text, one height per
   row, no leftover shadow/border/pill, contrast in both themes. Fix what is off, tokens first.
2. Measure instead of guessing where needed (`getBoundingClientRect` in a hidden instance): tab/door heights
   equal (both `--ctl-h` 28), label centred within 1 px.
3. Keyboard in menus (`ui/look/menu.js`): arrow up/down moves a `.picked` row (the CSS exists), Enter chooses,
   Escape closes (exists), `role="menu"`/`"menuitem"`. Accessibility is required, not optional.
4. Check the dark-mode page background fix with a `data:` page that sets no background.
5. Run the real Chromium build with the new UI (no rebuild needed for `ui/` changes, `LEECH_UI_DIR`).
6. `npm run check`, then update `docs/roadmap.md` phase 8 and this folder with a new dated hand-off.
7. Ask the owner to commit, or commit only if they say so. Suggested split: phase 1 (structure + tooling + docs)
   and phase 2 (design language) as two commits; the working tree currently mixes both.

## How to test (never on the owner's desktop)

The owner works on the same machine (Hyprland). An Electron started with `WAYLAND_DISPLAY` set opens a real
window on their screen; this happened three times early in this session. Always:

```sh
S=<scratch dir>; D=$S/data; mkdir -p $D
echo '{"welcomed":true,"look":"dark","sidebar":false}' > $D/settings.json
echo '{"width":1280,"height":800}' > $D/window.json
echo '<session json>' > $D/session.json   # {"tabs":[{"url":"data:text/html,<h1>One</h1>","title":"One"}],"active":0}
env -u WAYLAND_DISPLAY -u XDG_SESSION_TYPE LEECH_DATA_DIR=$D ELECTRON_ENABLE_LOGGING=1 \
  xvfb-run -a -s "-screen 0 1280x800x24" sh -c '
    node_modules/.bin/electron . --no-sandbox --ozone-platform=x11 > '$S'/log.txt 2>&1 &
    sleep 6
    xdotool search --name Leech windowactivate --sync; xdotool key ctrl+comma; sleep 0.8
    xwd -root -silent | ffmpeg -loglevel error -y -i - '$S'/shot.png
    kill %1'
grep CONSOLE $S/log.txt   # JS errors land here
```

- xdotool only inside that Xvfb. Arrow keys did not reach the welcome page there; clicking works.
- Chromium build: same pattern with
  `LEECH_UI_DIR=~/Projekte/Apps/leech/ui ~/Projekte/Apps/leech-chromium/src/out/Leech/chrome --user-data-dir=$P
  --ozone-platform=x11 --no-first-run --window-size=1280,800`; seed `$P/Default/Leech/settings.json` and
  `session.json`.
- Pixel comparison against an older state: `git archive HEAD | tar -x -C $S/orig`, symlink `node_modules`,
  run the same steps there, diff with PIL `ImageChops.difference(a, b).getbbox()` (None means identical).
  Since the design phase changes every pixel on purpose, this only applies to later pure refactors.
- Chromium rebuild after C++ changes: `PATH=<depot_tools>:$PATH nice -n 19 ionice -c 3 autoninja -C out/Leech
  -j 4 chrome` in the checkout (siso; plain `ninja` refuses). A small change relinks in seconds.

## Known gaps (also in docs/verification.md)

- No automated UI test; no per-component verification plans; C++ function length unchecked.
- `ui/panels/bookmarks.js` and `ui/chrome/bookmarks.js` each build a bookmark outline; similar, not merged.
