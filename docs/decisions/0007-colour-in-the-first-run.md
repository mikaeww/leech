# 0007: The mark's colours in the first run

**Status:** accepted
**Date:** 2026-10-01

## Context
ADR 0002 keeps the interface grey. The owner found the welcome dead that way: a grey rail, a white sheet, a grey
globe, while Leech's own mark is blue (`assets/leech.png`: #045af2 with an ink tail). They asked for more colour
and for gradients, but without changing what the welcome does.

## Options
- Keep it grey and add movement or pictures: still as monotone as before, which is what was objected to.
- Colour the whole interface: the chrome around pages is meant to stay out of the way, and nobody asked for it.
- Colour only the first run: the one screen that introduces Leech before any page is open, and is seen once.

## Decision
The third. `tokens.css` gains `--brand*` and `--glow` for both looks, used only in `ui/styles/welcome.css`:
the step on screen and every choice in the mark's blue, Continue on a blue-to-violet gradient (white on every
stop at 4.5:1 or more), the mark itself on a gradient, a full stop in blue ending each title, a soft glow of
blue, violet and cyan behind the words' free half that drifts a little with each step (still under reduced
motion), and the Blue Marble dithered in blues (the backdrop reads `--dots`, `--dots-2` and `--dots-clear` from
its own stage). No shadows, borders or pills come back; everywhere else ADR 0002 holds unchanged.

## Consequences
- The first run no longer looks like the rest of the window; that is the point of it.
- Colour anywhere else needs a new decision, not a reuse of these tokens.
- `check:ui` runs the welcome in both looks and asserts the step on screen is blue.
