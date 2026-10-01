# 0008: The owner's own colours

**Status:** accepted
**Date:** 2026-10-01

## Context
ADR 0002 keeps the interface grey and 0007 colours only the first run. The owner wants the whole browser
colourable by hand: the sidebar and the rest of the window, gradients, special colours for the dithered
picture, all with a colour picker. Chromium's own colour chooser is not reachable from Leech's interface in the
Chromium build (its contents have no colour chooser delegate), and the chrome around the page is a spread
shadow there, which can't be a gradient.

## Options
- Chromium's themes (`chrome://customize-chrome`): they colour Chromium's own frame, which Leech hides.
- A handful of fixed themes to choose from: little code, but not "fully" anything.
- Grey as the default, and every surface colour the owner's to set: window (one colour or a gradient, optionally
  dithered), accent, new tab sheet and its dots, with presets as starting points and a picker of our own.

## Decision
The third. The default stays ADR 0002's grey and draws exactly as before. A `paint` setting holds the owner's
choices; `ui/paint` turns it into custom properties. Text on a painted surface takes the ink of the light or
the dark look, whichever contrasts more with the colours under it; raise steps there become translucent ink so
they work on any colour. The picker is Leech's own popover. In the Chromium build a masked ring round the stage,
painted with the window's background, replaces the spread shadow. Shadows, borders and pills stay forbidden.

## Consequences
- The design language's "no colour" holds for what Leech ships, not for what the owner chooses.
- Presets are data; adding one needs no decision.
- A colour the owner picks may be loud; contrast of text is kept, taste is theirs.
