# 2026-10-01: welcome turn, sidebar glide, split switching

Hand-off for the next agent. Historical: the state at the end of this session.

## Task

The owner asked for a clean turn of the Leech mark on the welcome page when Continue is pressed, said the
split's switching was still buggy (answered: "switching to another tab"), and that unfolding the sidebar was
not smooth.

## Done (each committed and pushed)

- 517c20f: the card never glided at all. Its arrive animation filled `both` and so owned `transform`; the
  glide's transition never ran. In the Chromium build the page now rides with the card at its final size.
  Found and measured by recording the private Xvfb with ffmpeg x11grab at 60 fps and reading the card's
  corner and the page text per frame. `npm run check:ui fold-glide` guards it.
- dce8579: the welcome mark turns 360° on minimum jerk (`look/motion.js` `turn`), dips, sends a wave out;
  `welcome/moves.js`. `npm run check:ui welcome-turn` samples it every frame.
- d9dac2e: the split bug the owner saw is most likely this one, found while testing switches: a tab opened
  by a page (target=_blank) in the Chromium build arrives without an address, and `wake()` gave up on it, so
  the UI showed a blank tab over the real page. Fixed in `wake()`. Also: a new tab from a split pane goes
  after the pair; split panes never sleep or go to the archive.

## Not reproduced

Switching between a split and a single, unloaded, blank or folder tab, by API, by real clicks in the
sidebar and in the panes, and recorded at 60 fps, was correct every time. If the owner still sees the
split misbehave, ask for the exact steps; the harness pattern is in the 2026-10-01-zen-features hand-off.

## Known gaps

- While unfolding the sidebar the page trails the card by up to one frame (28 px at peak speed in Xvfb's
  software compositing); no prediction was added since Xvfb timing says little about real hardware.
- The Chromium build still has no automated check; its runs were by hand.
