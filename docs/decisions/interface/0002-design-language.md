# 0002: A grey, borderless design language instead of Search's surface

**Status:** accepted
**Date:** 2026-09-30

## Context
Leech copied Search's look one to one: pills (fully round buttons, toasts, the find bar), drop shadows and
hairlines on every floating surface, a blue highlight in menus, a red refusal outline, a breathing glow under
the address field, and font sizes such as 10.5, 11.5, 12.5 and 15.5 px chosen per component. The clean-project
design language asks for the opposite: depth by brightness alone, no borders, shadows, pills or colour, one
type scale and one spacing scale, all as tokens.

## Options
- Keep Search's surface and only tidy its values into tokens: faithful, but keeps every shadow and pill.
- Keep Search's geometry and drop its decoration: half a language, still no scale.
- Move the whole surface to the clean-project language, keeping Search's layout, sizes of the chrome
  (strip height, tab width, sidebar width) and its motion curves.

## Decision
The third, chosen on 2026-09-30. Tokens are derived from Search's own greys (Design.swift), which are already
neutral: `bg`, `raise1`–`raise3`, `fg`, `sub`, `faint`, `chip-on`. Two radii (10 for surfaces, 7 for controls),
type scale 11 / 12 / 13 / 15 / 17 / 26 px, spacing on a 2 px grid. Search's three motion curves stay.

## Consequences
- Floating surfaces (address field, lists, menus, panels, toasts, find) are told apart from the page by a
  brightness step, not a shadow; over a page they sit on `raise1`/`raise2`.
- Errors are said in words and weight, not in red; the menu highlight is a grey step, not blue.
- The look no longer matches Search's screenshots; the layout and behaviour still do.
- Every value lives in `ui/styles/tokens.css`; a component that needs a new value adds a token first.
