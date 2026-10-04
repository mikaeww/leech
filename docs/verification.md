# Verification

## What counts

- A claim holds when a check shows it on real input. A check that didn't run is not a pass; a quoted source is
  not a check.
- Logic without a DOM (`ui/places/`, the password CSV, the structure check) has unit tests with an independent
  expectation written out by hand.
- The interface is checked by running it: the Electron shell headless in its own Xvfb, throwaway data, both
  themes, screenshots looked at against the design rules. The real input is keys and clicks on that private
  display, never on anyone's desktop.
- A refactor that should draw exactly what it drew before is compared pixel for pixel with the build before it,
  after the same sequence of keys and clicks.

## Checks that exist

| Check | Covers | Run |
| --- | --- | --- |
| ESLint | style, undefined and unused names, the size limits | `npm run check` |
| `tools/structure.mjs` | files, folders, depth, names, READMEs, purpose comments | `npm run check` |
| `test/logic.test.mjs` | address parsing, search addresses, history ranking, CSV import | `npm run check` |
| `test/structure.test.mjs` | that the structure check finds each limit | `npm run check` |
| `test/archive.test.mjs` | which tabs are due for the archive; its order, limit and search | `npm run check` |
| `test/hidden.test.mjs` | hidden-element rules per site, undo and restore, the sheets, a damaged file | `npm run check` |
| `tools/ui-check.mjs` | the running UI: scenarios driven over CDP in a private Xvfb, each on a fresh profile, keys that must pass the browser's shortcuts typed with xdotool on that display (page-script, veil: see below; essentials: a row carried up onto the empty grid and one carried onto a tile become tiles, a tile carried onto another takes its place, carried across spaces, kept out of space sessions, saved and removed; downloads-door: there before anything downloads, the strip's right-click menu turns it off and on in strip and sidebar alike, saved; archiving: an idle loose tab goes, pinned and folder tabs stay, reopened from the panel; media: the bar names the playing tab while another is on screen, pauses it and leads back; folder-chips and folders: a chip per folder in the strip folds its tabs; a row carried onto a folder goes in; leaving a folder folds it; Turn into a Space moves its tabs; split: two half panes under one ground in the sidebar, the divider moves them, another tab shows alone, closing a pane frees its partner; fold-glide: folding the sidebar glides the card through in-between places to rest at the edge; welcome-turn: the mark turns only forward, rests exactly where it began, and a press during the turn skips no page; folder-from-menu: a right-click makes a folder, named as typed, holding the tab; clear-tabs: Clear takes every unpinned tab and the folder into the archive, the pinned tabs stay, a new tab is on screen; tab-address, in the dark look: typed text and Enter searches with the chosen engine; typing shows suggestions with a search, the arrows pick it, Enter searches; paint: a saved gradient paints the sidebar with light ink and the accent, the Colours page's picker paints one pale colour with dark ink, Escape closes only the picker, the colour is saved, Reset gives the grey back, a saved gradient arrives as its dithered pixels, a dithered gradient as dots, the live pill blurring the dots behind it; paint-presets, in the dark look: every preset's sidebar text reads at 4.5:1 or more on all its colours, pictured on a blank tab; passwords-panel, Chromium only: accounts added, changed, revealed, removed and imported through the Passwords panel, each step held against the profile's `Login Data`, an account already kept keeping its password over a CSV's, a shown password hidden once it changed; addresses, Chromium only: an address saved through Chromium's settings API is stored only as encrypted blobs, nowhere in the clear in `Web Data` or its journal, and reads back whole) | `npm run check:ui` (long task, starts a browser) |
| `tools/ui-check.mjs --chromium` | the scenarios marked for it (`chromium: true` in `tools/ui-check/`: every one but split), in the Chromium build; the ones about pages: page-script: the page script's messages arrive, the UI's reach it, the page's own scripts can't see it, reading progress and typed input; veil: the shield hides an ad slot, a picked box goes, stays gone after a reload, Ctrl+Z typed while picking brings it back and hidden.json follows; tab-address as in the Electron shell; sleep: an idle tab falls asleep, one holding typed input stays awake, the sleeper wakes on its page and (Chromium) Back leads to the page before, with its title; clear-typed: Clear leaves the tab holding typed input and says why; peek: shift-click opens the peek, the tab stays, a real click in the frame's hole reaches the peeked page and not the tab, Esc typed there closes it, Open as a tab keeps it on screen; passwords (Chromium only): after a sign-in Chromium's save bubble is found on the display by its button's colour at the stage's top right, Save (a real click) closes it, the next visit is filled; shield: an image from an ad host (every host maps to the check's server) is refused on another site, loads once the site is paused and with the shield off, is refused again when it is back on, and Settings › Privacy has the shield's lines; split-session (both shells): a pair saved in the session comes back as a split with both pages visible, separating it leaves no split in the session, splitting again saves each tab naming the other; tab-completion: a double click on a tab not on screen opens its address (Electron: a click once it loaded), typing finishes a visited address with the finished part selected, Backspace takes it away; opened-tab (Chromium only): a link the page opens in a new tab is taken in loaded once, its opener kept; welcome-pages: the first run's five pages walked with the arrow keys, the rail following, each with its title (pictured with `--shots`) | `npm run check:ui -- --chromium` (long task, needs the build) |

## Plans

- [Chromium settings bridge](verification/chromium-settings.md)
- [The page script](verification/page-script.md)
- [Paint, the owner's colours](verification/paint.md)
- [Passwords in the Chromium build](verification/passwords.md)

## Known gaps

- The UI check covers the scenarios in `tools/ui-check/` only; the look is still judged from screenshots
  (`--shots=dir`) by a person. In the Chromium build only the scenarios marked for it run.
- No per-component verification plans with claims and oracles yet; the first candidates are `ui/places/history.js`
  (ranking) and `ui/places/address.js` (what counts as an address), where an exhaustive or differential test
  against Chromium's own omnibox classification would be the strong method.
- The C++ is checked by compiling and running the build; it has no tests of its own.
