# 2026-09-30: features after Zen

Asked by the owner on 2026-09-30: essentials, archiving with settings, a media bar, folder extras, split view,
Chrome extensions; and in the sidebar: lines between its parts, "New tab" above the tabs, a resize as smooth as
Zen's, better icons. Each part is its own phase with a check, a commit and a push.

## A. Sidebar polish

- Lines: a hairline between the pinned part and the tabs, as Zen draws it. ADR 0002 forbids lines as
  structure; [ADR 0003](../decisions/interface/0003-sidebar-lines.md) allows exactly this one kind, as a token.
- "New tab" moves from under the tabs to the first row under the line.
- Resize: the edge follows the pointer once per frame, and the page keeps its size while the edge moves, as
  in a glide: in the Chromium build the page stays laid out from the narrowest sidebar width and the stage's
  hole shows the part the column doesn't cover; in Electron the webview is held the same way. The page takes
  its new size once, on release. Before: every pointer move re-rendered everything and resized the page, which
  lags the column by the IPC round trip and relays the page out every frame.
- Icons: Lucide's own paths (ISC) instead of redrawn ones; three sizes, each the size of the text it sits by
  (12 by small text, 13 by body text) or 16 alone in a door; one visual stroke.
- Check: screenshots of both themes, the drag driven by real pointer events with the page's width read before,
  during and after (it must not change until release).

## B. Essentials

Zen's model: essentials are one grid of tiles shared by every space (`essentials.json`, one list of
`{url, title, pin}`); a space's own pinned tabs become rows above the line. Essentials open in the space on
screen and keep their home address like pins. Tab menu: "Add to Essentials" / "Remove from Essentials".
Existing pins stay pinned in their space; nothing is moved without being asked.

## C. Archive

Loose tabs not looked at for a set time leave the row for an archive; the archive is a panel like history
(search, reopen, remove, clear). Settings › Tabs: on/off and after how long (12 hours, a day, a week). Pinned
tabs, essentials, tabs in folders, playing tabs are never archived. The archive keeps the last 500.
Logic in `ui/tabs/archive.js`, unit-tested with a fake clock.

## D. Media bar

When a tab plays sound and is not on screen, a bar at the foot of the sidebar shows its title with play/pause,
mute and "go to tab". Play/pause needs the page's media: Electron runs a small script in the page; the
Chromium build asks the tab through the bridge.

## E. Folder extras

Folders in the strip as a tab-like chip that opens a menu of its tabs; "Close folder on leaving" (a folder
whose tabs you leave folds); "Turn into space"; dragging a tab onto a folder header puts it in.

## F. Split view

Two tabs side by side in the stage, a draggable divider, "Split with…" in the tab menu and by dropping a tab
on the page's edge. UI decides the two rects; Electron shows two webviews; the Chromium build shows two tabs'
views (C++ in `leech_view.cc`: two page rects instead of one). Needs a rebuild.

## G. Chrome extensions

The Chromium build: turn Chromium's extension system on for the Leech window (the Web Store installs), show
installed extensions' actions in a door menu, their popups anchored there. Needs C++ and a rebuild. Electron:
out of scope (its extension support is partial); the dev shell says so.
