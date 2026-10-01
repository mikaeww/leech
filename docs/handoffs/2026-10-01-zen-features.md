# 2026-10-01: features after Zen (phase 9)

Hand-off for the next agent. Historical: the state at the end of this session.

## Task

The owner asked on 2026-09-30 for Zen-like features: essentials, archiving with settings, a media bar, folder
extras, split view, Chrome extensions; and in the sidebar: lines between its parts, "New tab" above the tabs, a
resize as smooth as Zen's, better icons. Plan: [plans/2026-09-30-zen-features.md](../plans/2026-09-30-zen-features.md).
The owner asked not to wait for approval between phases; each phase was committed and pushed on its own.

## State

All seven parts are done, each its own commit on `main` (958288d … this one). `npm run check` passes (11 unit
tests); `npm run check:ui` passes all six scenarios (essentials, archiving, media, folder-chips, folders, split).

Decisions taken:
- ADR 0003: one hairline in the sidebar, under the pinned part (the owner wanted lines; 0002 forbids them).
- Essentials follow Zen's model: the tile grid is shared by every space; a space's own pins became rows above
  the line. Existing pins were not moved into essentials.
- Archiving is off by default.
- Split view in the Chromium build uses Chromium's own split (`MultiContentsView`), quieted by the patch.
- Extensions only in the Chromium build; the Electron shell shows no door.

## How to test the Chromium build

Same rule as before: never on the owner's screen. Start `out/Leech/chrome` through `xvfb-run -a` with
`WAYLAND_DISPLAY` and `XDG_SESSION_TYPE` unset, `--ozone-platform=x11`, a throwaway `--user-data-dir=$P` seeded
at `$P/Default/Leech/` (the seed in `tools/ui-check/seed.mjs` writes the same files), `LEECH_UI_DIR=<repo>/ui`
and `--remote-debugging-port`; connect with `tools/ui-check/cdp.mjs` to the target whose URL starts with
`chrome://leech`. The page is a native view under the UI, so take pictures with `xwd -root` on that display, not
CDP. xdotool only on that display. A test extension loads with `--load-extension=<dir>
--disable-features=DisableLoadExtensionCommandLineSwitch`.

Checked this way: split (both panes, 10 px gap in `--bg` light and dark, a click into a pane activates it,
unsplit), the sidebar drag (page held, laid out once on release), an extension's popup hanging from its door.

## Known gaps

- Splits are not kept across a restart (ponytail note in `ui/tabs/groups/split.js`).
- The media bar's play/pause can't reach players inside cross-site frames.
- The archive looks only at the space on screen; a parked space's idle tabs go when it is entered.
- Extension menu rows have no icons; extension popups use Chromium's own bubble look.
- The Chromium build has no automated check; its runs above were by hand.

## Next step

Nothing is half done. Candidates the owner has not asked for yet: keep splits in the session, extension icons
in the menu, the roadmap's open items (autoscroll, swipe disc, Widevine, AUR package, first release).
