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
| `tools/ui-check.mjs` | the running UI: scenarios driven over CDP in a private Xvfb, each on a fresh profile (essentials: carried across spaces, kept out of space sessions, saved and removed; archiving: an idle loose tab goes, pinned and folder tabs stay, reopened from the panel; media: the bar names the playing tab while another is on screen, pauses it and leads back; folder-chips and folders: a chip per folder in the strip folds its tabs; a row carried onto a folder goes in; leaving a folder folds it; Turn into a Space moves its tabs; split: two half panes, the divider moves them, another tab shows alone, closing a pane frees its partner; fold-glide: folding the sidebar glides the card through in-between places to rest at the edge; welcome-turn: the mark turns only forward, rests exactly where it began, and a press during the turn skips no page; folder-from-menu: a right-click makes a folder, named as typed, holding the tab) | `npm run check:ui` (long task, starts a browser) |

## Known gaps

- The UI check covers the scenarios in `tools/ui-check/scenarios.mjs` only; the look is still judged from
  screenshots (`--shots=dir`) by a person, and the Chromium build is run by hand.
- No per-component verification plans with claims and oracles yet; the first candidates are `ui/places/history.js`
  (ranking) and `ui/places/address.js` (what counts as an address), where an exhaustive or differential test
  against Chromium's own omnibox classification would be the strong method.
- The C++ is checked by compiling and running the build; it has no tests of its own.
