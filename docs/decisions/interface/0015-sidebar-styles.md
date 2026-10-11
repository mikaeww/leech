# 0015: Three sidebar styles, picked in Settings

**Status:** accepted
**Date:** 2026-10-10

## Context
After ADR 0014 the owner still found the sidebar too close to Zen. A document-tree redesign with the page flush
against the column was rejected ("dead, unclean"): Leech is frame and stage, the page a rounded card 8 inside the
window. Three drafts that keep the stage were shown (a list with addresses, a rail of icons, cards two across);
the owner asked for all three, chosen in Settings, and after trying them took the rail out again (its
stacked navigation read as clutter).

## Options
- One of the three: the owner wanted all.
- Three separate sidebars (markup, render code, drag code each): three times the code to keep in step.
- One sidebar whose styles differ only in geometry and stylesheet: the same rows, pills, folders, splits and drag,
  placed by a per-style slot function and dressed by `#side[data-style]` rules.

## Decision
One sidebar, three styles in `prefs['sidebar.style']`: `classic` (the default, unchanged), `list`, `tiles`; a
saved `rail` falls back to Classic.
- `tabs/groups/tiles.js` holds each style's row step and Essentials tile size and places slot i (`slotPlace`);
  `chrome/sidebar.js` puts every row, folder header, pill and split ground through it.
- Outside Classic, back, forward and reload are one control (three segments on one ground) and the sidebar
  door waits at the foot, so the head fits the narrowest column (176).
- List: "Leech" heads the column beside the navigation; rows are 40 tall with the site's mark and the address
  under the title.
- Tiles: the page on screen heads the column where the band was, one line each: its mark and title, its address
  in a bar typed into in place (the tab's own address field and suggestions, `ui.tabEdit.at = 'now'`, no dialog), back, forward and reload as three equal tiles; the card never changes
  height. Essentials are four across, filling the column; pinned tabs are a launcher, marks on squares with
  their names under them; loose tabs and folder headers are cards two across; cards and pins are carried in
  reading order.
- No native tooltips anywhere in the UI (`look/tooltips.js`): a `title` becomes `aria-label` as it is set. Chromium's
  tooltip is a window in the system's font and frame (seen in the X11 test); on the owner's Wayland it is the
  likely cause of a thin box showing wherever the pointer rested, which the test display could not reproduce.
- All keep the stage, the greys and the springs of ADR 0002.

## Consequences
- A change to the rows has to be looked at in three styles; `npm run check:ui style-list style-tiles` checks
  where each puts its rows and the page, and that Settings switches on the spot; `side-at-rest` (Chromium build,
  a painted window) that pointing at things leaves nothing behind and shows no tooltip.
- Hovering shows no names or shortcuts any more; a Leech-drawn tooltip would be its own decision.
- Tiles shows less of a long title.
- Tiles' cards draw nothing for folder membership beyond their order after the folder's card.
