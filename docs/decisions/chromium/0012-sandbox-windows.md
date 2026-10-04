# 0012: Sandboxes as windows on their own off-the-record profile

**Status:** accepted
**Date:** 2026-10-04

## Context
"Open in Sandbox" should keep a site's cookies, storage and permissions apart from normal browsing. Chromium
can give one tab its own storage partition (`SiteInstance::CreateForFixedStoragePartition`), but permissions
(camera, microphone, notifications, location) are content settings of the profile, not of a partition: a
sandbox tab would inherit every answer given in a normal tab and leave its own answers behind. A browser window
holds tabs of one profile only.

## Options
- **A storage partition per tab.** The tab stays in the window. Cookies and storage are apart; permissions and
  extensions are not, unless Chromium's permission code is patched to look at the partition.
- **A window on a fresh off-the-record profile.** Everything Chromium keeps per profile is apart (cookies,
  storage, cache, permissions, extensions, history), in memory, by Chromium's own incognito machinery. A
  second window.
- **The primary incognito profile.** One shared incognito for every sandbox: they would see each other.

## Decision
A window on a fresh off-the-record profile per sandbox (`chromium/leech/sandbox/`). Of the off-the-record
profiles besides the primary one, Chromium lets only DevTools contexts have browser windows
(`OTRProfileID::AllowsBrowserWindows`), so a sandbox is one, as DevTools' `Target.createBrowserContext` makes.
The window's UI learns from `boot` that it is a sandbox and which page it was opened for, opens only that page,
says "Sandbox" beside the sidebar door, and writes nothing (an off-the-record profile never writes the store).
Leech destroys the profile once its last window has closed; Chromium only does that for the primary incognito
profile by itself. The link menu gets "Open Link in Sandbox" in `render_view_context_menu.cc`.

## Consequences
- A sandbox is a window, not a tab: the owner switches windows to use it.
- The Electron shell has no sandbox and shows no entry.
- Private tabs (Ctrl+Shift+N) in the Chromium build still share the normal cookie jar; giving them a partition
  or a sandbox of their own is a separate change.
