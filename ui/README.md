# ui

Leech's whole interface: plain HTML, CSS and JavaScript modules, no framework, no build step. The Chromium
build serves this folder as `chrome://leech` (from `LEECH_UI_DIR`); the Electron shell loads `index.html` from disk.

**For:** everything drawn around the page, and deciding what the browser does.
**Not for:** anything that needs the browser's own powers (files, keys before the page, the window). That goes
through `window.leech`, which `native.js` (Chromium) or `electron/preload/window.js` (Electron) provides.

| Folder | Holds |
| --- | --- |
| `app.js`, `start.js` | Entries: `start.js` picks the bridge, `app.js` wires everything and starts the first session |
| `state.js`, `elements.js`, `keys.js` | The shared state, element building, what each shortcut does |
| `tabs/` | The tabs as a model: views, opening and closing, editing, dragging, sleep, spaces, session; `groups/` holds folders and essentials |
| `chrome/` | What is drawn around the page: strip, sidebar, doors, bookmarks, the media bar, rendering, the panels' wiring |
| `page/` | What sits over the page: address field, find, notices, hiding, sign-ins, peek, site card |
| `guest/` | The page script: runs inside every page (not in the UI), in an isolated world; `chromium.js` is the Chromium build's stand-in for Electron's IPC |
| `panels/` | The panels (bookmarks, passwords, ...), one file per panel; `records/` holds history, downloads, archive; `settings/` the settings, Leech's pages and Chromium's |
| `welcome/` | The first run |
| `paint/` | The owner's colours (ADR 0008): colour arithmetic, applying the paint setting, the gradient's curve through its stops, the window's gradient as pixels, the colour picker, presets |
| `places/` | Addresses, engines, history ranking, bookmarks, the archive's rules, hidden elements, the shield's list: no DOM, unit-tested |
| `look/` | Icons, motion curves, theme switching, menus, shared controls, the new tab's picture |
| `styles/` | The stylesheet, split by surface; `tokens.css` holds every colour, size and duration |

Test: `npm run check` for lint, structure and unit tests; `npm start` runs it in the Electron shell.
