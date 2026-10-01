# Architecture overview

Leech is one interface (`ui/`) on two hosts. The interface decides everything; the host does what a web page
can't.

```
            ui/  (chrome://leech or file://.../ui/index.html)
             |  window.leech: calls out, events back
     +-------+--------+
     |                |
 ui/native.js     electron/preload/window.js
 chrome.send          ipcRenderer
     |                |
 chromium/leech/  electron/
 leech_ui.cc      main.js and its modules
 leech_view.cc
 leech_tab_watch.cc
 page/leech_guest.cc

 every page: ui/guest/page.js in an isolated world, messages back as "ipc-message"
```

## The hosts

- **Chromium build.** `LeechView` puts `chrome://leech` over the whole window, transparent, above a real tab.
  The UI tells it every frame where the page's stage is and which parts of the UI take clicks.
  `LeechHandler` (in `leech_ui.cc`) answers the UI's calls: tabs, files in the profile's `Leech/` folder,
  clipboard, the window, suggestions. `TabWatch` turns each tab's events into the `<webview>` events the UI
  already understands. `GuestChannel` (`page/leech_guest.cc`) runs the page script in each committed page and
  keeps one promise open per tab for its messages ([ADR 0005](../decisions/0005-page-script-in-chromium.md)).
- **Electron shell.** The same calls over IPC. Pages are `<webview>` elements with `ui/guest/page.js` as their
  preload.

Both run the same page script (`ui/guest/page.js`): reading progress, typed input, sign-in boxes, the element
picker, shift-click peek. In Chromium `ui/guest/chromium.js` stands in front of it for Electron's `ipcRenderer`.

## The interface

`ui/state.js` holds the settings, the stores (history, bookmarks, icons), the tabs of the space on screen and
the UI's flags. Every other module reads and changes it; it imports none of them.

A change goes: an action (`keys.js`, a click in `chrome/` or `page/`) changes state through `tabs/`, then calls
`render()` (`chrome/render.js`), which redraws the strip or the sidebar, the stage, the address field and the
bars from state. Elements are kept per tab and only rebuilt when what they show changes shape (`chrome/marks.js`).

The session of the space on screen is written a moment after each change (`tabs/session.js`), and at once when
the window closes. Panels (`panels/`) draw one plate at a time from their own state and reach the window only
through the callbacks `chrome/panels.js` gives them.
