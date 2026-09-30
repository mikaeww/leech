# 0001: Clean-project conventions and their checks

**Status:** accepted
**Date:** 2026-09-30

## Context
Leech grew as a one-to-one port: `ui/app.js` had reached 2399 lines, `ui/panels.js` 716, the stylesheet 864,
`main.js` 512, `leech_ui.cc` 636. There was no lint, no check command and four unit tests. Helpers such as the
element builder and the switch control existed three times.

## Options
- Keep the flat files and only fix bugs: cheapest now, and every later change stays a search through 2000 lines.
- Adopt the clean-project rules with hand-rolled checks only: no new dependencies, but checking function length
  and missing imports in JavaScript needs a parser.
- Adopt the rules with ESLint (pinned, dev only) for JavaScript and a small own structure check for what ESLint
  can't see (folders, other languages, READMEs).

## Decision
The third. Dev dependencies `eslint`, `@eslint/js`, `@stylistic/eslint-plugin`, `globals`, exact versions, all
MIT. ESLint's `no-undef` also guards the split: every name a module uses must be imported.

## Consequences
- `npm run check` is the gate before every commit.
- The UI is a set of modules that import each other in a cycle; exported functions must be declarations
  (see conventions). The shared state lives in `ui/state.js`, which imports nothing of the UI.
- C++ function length isn't checked by a tool yet.
