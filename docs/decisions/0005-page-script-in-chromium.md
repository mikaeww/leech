# 0005: The page script in the Chromium build: an isolated world and a promise it settles

**Status:** accepted
**Date:** 2026-10-01

## Context
Electron runs Leech's page script (reading progress, typed input, sign-in boxes, the element picker, shift-click
peek) as each webview's preload and carries its messages over IPC. The Chromium build had nothing in its place:
`send()` was empty and nothing came back, so tabs never slept, the archive never took a loaded tab, the picker
and peek did nothing, and Clear had to stop asking about typed input. A page script needs three things: to run
before the page draws, out of the page's reach, and a way to speak first.

## Options
- A component extension with a content script and `chrome.runtime` messaging: built for this, but it brings
  an extension, its background worker and a messaging hop for every scroll.
- A renderer-side patch (Mojo interface from Leech's script to the browser): the cleanest wire, and the largest
  patch to carry across Chromium releases.
- Run the script with `RenderFrameHost::ExecuteJavaScriptInIsolatedWorld` as each page commits, and let the
  browser ask for messages with a promise the script settles when it has some. Blink doesn't await a promise on
  that path; one line makes it.
- The same, polling on a timer: no patch, but every tab woken many times a second.

## Decision
The third. The script lives in `ui/guest/` (served with the UI): `chromium.js` stands in for Electron's
`ipcRenderer`, `page.js` is the script both shells run. `chromium/leech/page/leech_guest.*` puts both, with
the UI's last `L.configure`, into Chrome's internal isolated world on every committed http(s) or file page,
then keeps one `leechHost.next()` call open per tab; each answer is a batch of `[channel, args]` handed to the UI
as Electron's `ipc-message`. The UI speaks back by running `leechHost.hear(...)` in the same world.
`local_frame_mojo_handler.cc` awaits a promise in `JavaScriptExecuteRequestInIsolatedWorld`.

## Consequences
- One page script for both shells; the UI's modules don't know which shell they run in.
- The page's own scripts can't see or forge the channel: it lives in an isolated world (checked in the UI
  check, `page-script`).
- The other callers of that Blink path (DOM distiller, commerce, web-app utilities) now get a promise's value
  instead of an empty result if their script returns one. Not checked caller by caller; none of them is a
  feature Leech shows.
- The script runs right after commit, not before the first byte of the page: a page may draw a frame before a
  hidden element's sheet is in. A page back from the back-forward cache keeps the script it had.
- Frames inside the page get no script, as in Electron (preloads run in the main frame only).
