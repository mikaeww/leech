# 0014: Section labels in the sidebar instead of the line

**Status:** accepted
**Date:** 2026-10-10

## Context
ADR 0003 drew one hairline between the pinned part and the tabs, with "New tab" and Clear in a row under it,
because the sidebar read as empty and unstructured with space alone. The owner now finds the sidebar looks too
much like Zen, whose sidebar is exactly that: pinned rows, a rule, a "+ New Tab" row with Clear.

## Options
- Section labels: small uppercase labels name the parts (Pinned, Tabs); the new tab's plus and Clear sit at the
  Tabs label's end. Structure without a line, in the form ADR 0002 already describes for sections.
- An address field at the top of the sidebar, taking the place of the navigation row and "New tab": a second
  address field next to the one Leech already has (Ctrl+L).
- Numbered rows, the live tab inverted: depends on Alt+number shortcuts Leech doesn't have.

## Decision
A section label over the pinned rows, when there are any, starting at the rows' content edge, in place of the
line. The tabs keep the whole "New tab" row (with Clear, shown while the sidebar is pointed at): a Tabs label
with a plus at its end was tried and the owner wanted the whole row to click again. The line and its `--rule`
token are gone; ADR 0002 holds without exception again.

## Consequences
- Folders stay rows with a chevron, as before.
- `npm run check:ui sections` guards the label, its edge and the "New tab" row.
