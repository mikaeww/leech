# 0013: The Dev UI speaks the DevTools protocol to the tab on screen, without Claude

**Status:** accepted
**Date:** 2026-10-05

## Context
The Dev UI (Settings › General) turns the window into a browser for testing a site: a column of tools left of the
page with Explorer, Console, Network, Elements, Storage and a security check. The tools need what DevTools sees:
every request with its headers and bodies, console messages, the DOM, cookies with their flags, storage. Leech's
UI is a WebUI page (`chrome://leech`) over real Chromium tabs, so it has none of that by itself. The first plan
also had Claude in the column, run as the local `claude` CLI and given the tab and the folder as tools.

## Options
- **Chromium's own DevTools window or panel.** Everything there, but it is Chromium's UI in Chromium's look, the
  opposite of the owner's wish for a cleaner tool, and it can't share state with Leech's panels.
- **The page script (ADR 0005) reporting from inside the page.** No privileged view: no response headers, no
  HttpOnly cookies, nothing about requests the page didn't make itself.
- **A DevTools protocol client in C++ that the UI talks through.** `content::DevToolsAgentHost` attached to the tab
  on screen, protocol messages passed as JSON both ways; every tool is plain JS in `ui/dev/` over it.
- **Claude in the column.** Owner decision on 2026-10-04: left out. The Dev UI is built without it.

## Decision
The C++ client (`chromium/leech/dev/leech_dev.*`): one tab at a time, web pages only (`MayAttachToURL` refuses
WebUI and `chrome://`), no local file reads or writes through the protocol. The UI switches on the domains the
tools need, skips every debugger pause (nothing could resume one), and keeps requests, console lines and the DOM
in the tool modules. The Explorer's files go through `files/leech_folder.*`, which only opens folders the owner
chose in Chromium's chooser since the browser started, and nothing outside them. The security check is passive:
it reads what the page already sent and sends nothing to the site; "Send again" and "Edit and send" are the page
fetching with its own cookies, the request the owner sees.

## Consequences
- The Electron shell has no Dev UI (no bridge), as with sandboxes and extensions.
- Requests made before the column attached aren't in Network; the tools say so and offer a reload.
- A tool Chromium's DevTools has and this column doesn't (performance, sources, breakpoints) stays in Chromium's
  DevTools, still reachable with Ctrl+Shift+I.
- Claude is not part of Leech.
