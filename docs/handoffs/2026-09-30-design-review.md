# 2026-09-30: design review of the new surface

Hand-off for the next agent, second session of the day. Historical: the state at the end of this session.
Follows [2026-09-30-clean-project.md](2026-09-30-clean-project.md), whose steps 1–6 this session did.

## State

**Nothing is committed**, as before. The working tree still mixes phase 1 (structure, tooling, docs) and phase 2
(design language). `npm run check` passes: ESLint, structure, tokens, 9 unit tests.

## What was checked

A CDP driver (Electron started with `--remote-debugging-port`, pages served from a local `python3 -m
http.server` because a session only restores `http(s)` tabs) went through every surface in both themes: strip,
sidebar with pins and a folder, new tab, address field with suggestions, tab and page menus, find with and
without a match, a toast, history, bookmarks, downloads, passwords, every settings page, the welcome pages, a
page without its own background. The Chromium build (`LEECH_UI_DIR`, no rebuild) showed the same in both themes.

Measured with `getBoundingClientRect` and range rects: strip doors, tabs, rail rows, actions, fields are
28 px, segmented buttons 24 px; every label sits within 0.9 px of its control's middle, icons exactly centred.

## Fixed

- History's search field was 16 px tall: `.hunt` had `flex: 1`, which a column squeezes. It is now only
  stretched in a row (`.search-bar`).
- Inline `style.cssText` with `gap: 10px` (off the scale) in history and passwords: now classes. ESLint forbids
  `cssText` in `ui/` so the token check sees every value.
- Section captions sat 4 px left of the rows' content; menu headers 8 px left of the labels. Both aligned.
- Secondary buttons on a card were `raise1` on `raise1`, invisible as buttons; on a card they step to `raise2`.
- Menus: keyboard (arrows skip disabled rows and wrap, Enter/right opens a submenu, left closes it, Escape
  closes all), `role="menu"`/`menuitem`/`menuitemcheckbox`, focus moves to the menu and back after. Checked by
  driving a menu with real key events: down, down, down, right, down, Enter chose the second submenu row.

## Open

- Pure look, not decided: the find bar grows leftwards when "No matches" appears; settings has a fixed height,
  so short pages leave room under their card. Both are Search's behaviour.
- The welcome page does not close on Escape (by design, it is the first run).
- Still no automated UI test (`docs/verification.md`); the driver lived in the session's scratch folder.

## Next step

Ask the owner to commit. Suggested: phase 1 (structure + tooling + docs) and phase 2 (design language, this
review) as two commits; separating them needs `git add -p` by hand, since several files carry both.
