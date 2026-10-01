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

## Oracles and methods
| Claim | Oracle | Method |
| --- | --- | --- |
| 1 | Round trip | Exhaustive over the grid (`test/paint.test.mjs`) |
| 2 | WCAG 2.1 definition, its two fixed points | Example values plus symmetry over the grid |
| 3 | Monotonic luminance of greys | Exhaustive over 256 greys |
| 4 | The build before the change | Screenshots compared pixel for pixel |
| 5 | Computed styles in the running UI | `npm run check:ui paint` (and `--chromium`) |

## Known gaps
- During a glide or the first arrival the gradient on a moving surface moves with it for a moment
  (`background-attachment: fixed` is relative to a transformed element).
- Contrast is judged on the chosen colours, not on what the dither or a radial gradient makes between them.
