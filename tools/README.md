# tools

**For:** development commands. `tokens.mjs` checks that every colour, font size, radius and spacing in `ui/styles` comes from
`tokens.css`, tested in `test/tokens.test.mjs`. `structure.mjs` is the structure check from `docs/conventions.md` (lines per
file, files per folder, depth, names, a README per component, a purpose comment on every code file). It runs
in `npm run check` and is tested in `test/structure.test.mjs`.
`ui-check.mjs` (with `ui-check/`) starts the Electron shell in its own Xvfb with a throwaway profile per
scenario and drives it over the DevTools protocol; `npm run check:ui`, a long task kept out of `npm run check`.
**Not for:** anything Leech needs at run time.
