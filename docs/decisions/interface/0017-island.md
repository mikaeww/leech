# 0017: The island: a black notch at the top of the page for what is happening and the shield's switches

**Status:** accepted
**Date:** 2026-10-12

## Context
The shield and its guard (ADR 0016) work out of sight: a stopped redirect leaves no trace, and turning the guard
on for a site meant editing a list in the code. The owner wants the switches where the page is, in the shape of
Coucou's notch (github.com/Louis-CFM/coucou): a black island hanging from the top edge, out of the way at rest,
showing what just happened, opening to its controls. Coucou's code is MIT; its character (Mochi), its name and
its sounds are not, so none of them come along. The page must stay readable: nothing may sit over it for long.

## Options
- Lines in Settings › Privacy only: already there for the shield; a stopped redirect still goes unseen.
- A toast per stopped redirect: says it once, offers no switch, and stacks up on a page that tries again.
- An island over the top of the page: one place for the moment something happens and for the switches.

## Decision
The island, as `ui/island/`, inside the stage so it moves with the page:
- Its motion is Coucou's (`spring.js`, ported from `core/anim.ts`, notice in LICENSE): width, height and corner
  grow on SwiftUI's spring (response 0.5 s, damping 0.72, a little overshoot) and shrink on a 340 ms curve with
  none; content fades out in 160 ms and the next comes in over 300 ms after it, from 97 % size. Hidden it is a
  184 px sliver with no height, which it grows out of and goes back into.
- For a moment (4 s) it shows, small, what just happened: a redirect the guard stopped, a page that started
  playing, a download that finished; while something downloads it stays small with the progress. The newest
  moment wins (`activity.js`).
- Pointing at the frame just above the page's top middle, a click on the small island or Ctrl+Shift+A opens it;
  it closes when the pointer leaves, on Escape or on the shortcut again. It opens on the view of the moment.
- Open, a header of views as Coucou's, the most pressing count on its right:
  - Shield: on or off; ads on this site; redirects on this site, with what was stopped; the owner's list of
    guarded sites (`shield.guarded`, which starts as ADR 0016's) with each one's way off; what is hidden on this
    site, hide more, undo.
  - Page: the site, its connection and how far it is read; zoom; reader, float video, find, copy address,
    bookmark, hide something, print, duplicate, a sandbox (Chromium build).
  - Sound (only when a tab plays or played): each such tab with play or pause, mute, the way to it; mute the rest.
  - Tabs: new, private, reopen closed, clear the loose ones; history, bookmarks, archived, downloads, settings;
    what downloads, or the file that just finished with open and show in folder.
  Every tile and line runs what the browser already does (`keys.js` actions, the panels, the shell); nothing
  is shown that isn't really there, and what can't be done here is greyed out.
- It is black in both looks, its parts in the dark ink (`.ink-dark`), so the controls are the usual ones. Its
  corners where it meets the page curve outward like a notch's, never taller than the hull, and its lower
  corners are concentric with what is inside (`--r` plus its padding).
- Settings › Tabs › "Show the island" turns it off.

## Consequences
- A stopped redirect is seen, counted per page, and the guard can be set per site without touching code.
- The Chromium build tells the UI about a stopped redirect through the tab's channel (`guarded`), from the
  shield's callback list each tab watch listens to; Electron asks the page script to pass it on.
- Over the page top's middle for 4 s at a time, and while a download runs; a page's header can be covered then.
- Its measures are written every frame while they move (a rAF loop that stops when they settle), not by CSS
  transitions: a spring that keeps its speed when the target changes needs it.
- Black in the light look is a deliberate exception to ADR 0002's greys stepping away from the window: the island
  reads as part of the display, not of the chrome.
