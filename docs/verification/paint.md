# Verification: paint (the owner's colours)

Code: `ui/paint/`. Decision: [ADR 0008](../decisions/interface/0008-own-colours.md).

## Claims
1. `hexToHsv` and `hsvToHex` are inverse on every colour of a 16-level grid per channel (4096 colours), and
   `hsvToHex` always returns a valid `#rrggbb`.
2. `contrast` is the WCAG 2 contrast ratio: 21 for black on white, 1 for a colour on itself, symmetric.
3. `inkFor(colours)` picks the ink whose worst contrast over the colours is higher; for every grey from
   black to white it picks light text on dark greys and dark text on light ones, switching once.
4. With no `paint` set, the window draws exactly as before (pixel comparison of the stock scenarios).
5. A painted window paints sidebar and strip with the chosen colours, its text in the chosen ink, and the
   setting survives a restart.
6. A gradient runs through its stops on a curve (`ui/paint/curve.js`), not CSS's evenly spaced straight lines
   in sRGB, which change lightness at a different speed in each stretch and kink at a middle stop, so the eye
   reads zones. Each stop sits as far along as its perceived distance (OKLab) from the one before; a monotone
   cubic joins them in OKLab. The curve meets every stop, never leaves the range of the stops either side in
   any OKLab channel, has the same slope either side of the middle stop, and is a straight line in OKLab for
   two stops. A grey gradient running one way changes perceived lightness at one speed throughout: on
   `#000000, #2a2a2a, #bababa` 0.079 per tenth everywhere, where the old curve ranged from 0.027 to 0.127.
7. Every channel of every pixel of the smooth window raster (`raster.js`) is the curve's colour at that
   pixel's centre rounded down or up, never further, at 1x and 2x.
8. The smooth raster shows no bands: every 8x8 block averages within 1/6 level of the curve. On the gradient
   that showed bands (`#000000, #2a2a2a, #bababa`, 1080 px tall) the worst block is 0.118 levels off, where
   one block spans nearly two levels; rounding to the nearest level is 0.405 off.
9. The CSS gradients that stand in for the raster (`curveStops`: 65 points, interpolated `in oklab`) stay
   within a level of the curve for that gradient and every preset, and within 0.05 for greys running one way.

## Oracles and methods
| Claim | Oracle | Method |
| --- | --- | --- |
| 1 | Round trip | Exhaustive over the grid (`test/paint.test.mjs`) |
| 2 | WCAG 2.1 definition, its two fixed points | Example values plus symmetry over the grid |
| 3 | Monotonic luminance of greys | Exhaustive over 256 greys |
| 4 | The build before the change | Screenshots compared pixel for pixel |
| 5 | Computed styles in the running UI | `npm run check:ui paint` (and `--chromium`) |
| 6 | The stops; Ottosson's published OKLab values; slopes either side measured numerically; CSS Color 4 `in oklab` for two stops | Exhaustive over every three-stop combination of 16 greys, every 37th of 64 colours (`test/curve.test.mjs`); fails with even spacing, with straight lines and without the slope limit |
| 7 | CSS Images 3 geometry, written out in the test for the four axis angles | Exhaustive over 96x72 at both scales, for the banding gradient and every gradient preset |
| 8 | The curve | Every block of a 64x1080 window; fails when the dither is swapped for plain rounding |
| 9 | The curve | 1025 points each over the presets, the banding gradient and every fifth one-way grey combination |

## Known gaps
- During a glide or the first arrival the gradient on a moving surface moves with it for a moment
  (`background-attachment: fixed` is relative to a transformed element).
- Contrast is judged on the chosen colours, not on what the dither or a radial gradient makes between them.
- The raster is drawn on the main thread: about 35 ms at 1920x1080, 125 ms at 2x (radial about twice that),
  once at start and after a resize settles; until then the CSS gradient shows, with its bands.
- Claim 7 is checked at the axis angles; other angles and the radial shape share the code but not the oracle.
- Chromium's own gradients are dithered too in the software raster (Xvfb, `check:ui --chromium`): there the
  raster only spreads the dither over each whole band (longest flat run in one column 10 px before, 6 after).
  On the owner's display (GPU raster, Wayland, Hyprland, 2026-10-02, measured by hand from screenshots) the
  CSS gradient showed flat bands up to 54 px with levels missing; with the raster the longest is 6 px and no
  level between the darkest and lightest is missing.
- A later 8-bit conversion (the compositor's colour management, a screenshot tool) can still merge two levels
  into one and flatten the dither between them; nothing in Leech can see or undo that.
- The address field and its list (`--window-paint`) and the presets' chips stay CSS gradients on the curve's
  65 points: undithered, they band as any CSS gradient does. A stop that turns back over a short stretch
  (`#000000, #eeeeee, #dddddd`) leaves them up to 2 levels off the curve there.
- Stops far apart in hue can take the curve out of sRGB's gamut; it is clamped per channel there.
- The dithered dots still choose between evenly spaced stops on straight lines; the curve is for smooth windows.
- The middle stop no longer sits halfway: `#2a2a2a` lands at 36 % of `#000000, #2a2a2a, #bababa`.
