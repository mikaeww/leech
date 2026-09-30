# 0003: One hairline in the sidebar

**Status:** accepted
**Date:** 2026-09-30

## Context
ADR 0002 forbids lines as structure: parts are told apart by space and brightness. The owner found the
sidebar empty and unstructured that way and asked for lines between its parts, as Zen draws them: a thin rule
between the pinned tiles and the tabs, with "New tab" right under it.

## Options
- Keep space only: follows 0002, but the owner has said it does not work for them here.
- Lines wherever a part ends (sidebar, panels, menus): back to the look 0002 left.
- One kind of line, only in the sidebar, between the pinned part and the tabs: the place Zen uses it.

## Decision
The third. The line is a 1 px rule in the `--rule` colour, as wide as the rows, with the same space above and
below. Everywhere else ADR 0002 holds unchanged; the token check still refuses borders and outlines.

## Consequences
- `tokens.css` gains `--rule` for both looks.
- A second place for a line needs a new decision, not a copy of this one.
