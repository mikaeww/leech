# Conventions

Derived from the clean-project rules. Where Leech deviates, an ADR says why. Everything a machine can check is
checked by `npm run check`; the rest is on the reviewer.

## Language and layout

- Code, comments, names, documents and commit messages in English.
- Components: `ui/` (the interface), `chromium/` (Leech's part of its Chromium build), `electron/` (the
  development shell), `tools/` (development commands). Each has a README saying what it is for and not for.
- A new concept gets its own module or folder from the start; it is never appended to an existing file.
- No dumping-ground names: no `utils`, `helpers`, `misc`, `common`, `shared`, `stuff`.

## Limits (enforced)

| Limit | Value | Enforced by |
| --- | --- | --- |
| Lines per file (code, docs, stylesheets) | 500 | ESLint `max-lines`, `tools/structure.mjs` |
| Code files per folder (entries `start.js`, `index.js`, `index.html`, `main.js` and tests don't count) | 8 | `tools/structure.mjs` |
| Markdown files per `docs/` folder | 8 | `tools/structure.mjs` |
| Lines per function | 60 | ESLint `max-lines-per-function` (JavaScript only) |
| Parameters per function | 5 | ESLint `max-params` (JavaScript only) |
| Folder depth inside a component | 4 | `tools/structure.mjs` |

The C++ in `chromium/leech/` is held to the file limit by the structure check; its function length is on the
reviewer, since Chromium's clang-tidy setup isn't part of `npm run check`.

## Code

- Every code file opens with a comment saying what it is for (checked). Comments say why, never what.
- Private by default: a module exports only what another module imports.
- Entries only wire: `ui/app.js`, `ui/start.js`, `electron/main.js`, `ui/panels/index.js`, `ui/welcome/index.js`.
- Functions shared across modules in `ui/` are function declarations, not `const` arrows: the modules import
  each other in a cycle, and only declarations exist before a module has run.
- Window properties that read like app names (`history`, `open`, `close`, `find`, ...) count as undefined to
  ESLint, so a missing import can't silently become the browser's own.
- Errors are never swallowed without a comment saying why. A file that fails to parse is moved aside, never
  overwritten.
- New dependencies only when needed, pinned to an exact version, license checked; the reason goes in the commit.

## Interface

The design language is [ADR 0002](decisions/interface/0002-design-language.md): greys only, depth by brightness, no
borders or shadows or pills, one type scale, one spacing scale, all values as tokens in `ui/styles/tokens.css`.
Components use tokens, never raw values. The first run alone wears the mark's colours ([ADR 0007](decisions/interface/0007-colour-in-the-first-run.md));
everything else stays grey unless the owner paints it ([ADR 0008](decisions/interface/0008-own-colours.md)).
Light and dark are both required and both checked. Styles live in
`ui/styles`, never as `style.cssText` in `ui/` (ESLint), so the token check sees every value.

## Checks and workflow

- `npm run check:ui` runs the UI scenarios in a private Xvfb; a feature with state that survives a restart or a
  space change adds a scenario there.
- `npm run check`: ESLint (style and limits), the structure check, the unit tests. It runs at the lowest CPU
  and I/O priority. `npm run format` fixes what ESLint can fix.
- Before a change is done, the real program runs: the Electron shell headless in its own Xvfb with a throwaway
  `LEECH_DATA_DIR`, screenshots of both themes. Chromium changes build with `autoninja -C out/Leech chrome`,
  limited to a third of the cores.
- A refactor that should not change what is drawn is compared pixel for pixel against the build before it.
- One logical step per commit, documents in the same commit, the message says what was checked and how.
