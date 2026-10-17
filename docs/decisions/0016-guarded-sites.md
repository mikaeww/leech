# 0016: Guarded sites: a page there can't take its tab or a popup to another site

**Status:** accepted
**Date:** 2026-10-12

## Context
On aniworld.to every first click opens an ad: two popunder tags (`al5sm.com`, `nap5k.com`, `tag.min.js` with a
zone id) open the ad site in a new tab or send the tab there and the episode to a new one. The hoster frames
(VOE, Vidmoly, Doodstream, Filemoon) do the same from inside the player. The tags' domains rotate, the hosters'
own domains too (`voe.sx` forwards to `megankiddifference.com`), and a click is a user gesture, so Chromium's
popup blocker lets all of it through. Blocking hosts alone loses the race; Vidmoly also checks for blocked ads.

## Options
- More hosts in the shield's list: catches today's tags, misses next week's, and does nothing about the frames.
- A main-world script that replaces `window.open` and catches `location` changes: the page script runs in an
  isolated world (ADR 0005); a main-world script is a race with the page and can't stop `top.location` from a frame.
- The browser decides by the tab's site: a page in a tab showing a guarded site may not open a window on another
  site, nor navigate its tab (or the tab it opened) to another site, whichever frame asks.

## Decision
The third, for a short list of sites (`GUARDED` in `ui/places/shield.js`), as part of the shield: off with it,
paused with it per site. Chromium: `ChromeContentBrowserClient::CanCreateWindow` asks `LeechGuards` before a
window exists, and a navigation throttle cancels a renderer-initiated main-frame navigation whose initiating
frame's tab shows a guarded site and whose target is another site (`chromium/leech/page/leech_shield.cc`, two
calls in `leech.patch`). Electron: `setWindowOpenHandler` and `will-frame-navigate`. The two popunder hosts go on
the block list as well, so their tags don't load at all.

## Consequences
- On a guarded site, a link to another site (Discord, the footer's partner sites) does nothing. Typed addresses
  and the UI's own loads aren't the page's and pass; so do server redirects from the site's own pages, which is
  how aniworld's hoster links (`/redirect/…`) reach the hoster. Pausing the shield for the site lifts all of it.
- A middle click on a link to another site probably leaves an empty tab (untested): Chromium opens the tab
  before the throttle cancels its navigation. aniworld has few such links.
- `window.open('about:blank')` on a guarded site is refused too: a blank window is how a tag opens an ad
  before naming it.
- A new site is one entry in `GUARDED`; the UI check `guard` serves its page as `aniworld.to`.
