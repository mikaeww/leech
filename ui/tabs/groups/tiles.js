// Where the sidebar's tiles and rows sit: the Essentials grid, a carried tile, each sidebar style's slots; no DOM.

const GAP = 4
const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi))

// The tile under the pointer: a column past the row's end stays at that end instead of wrapping into the next row.
export function tileUnder ({ from, count, cols, dx, dy, stepX, stepY }) {
  const col = clamp(from % cols + Math.round(dx / stepX), 0, cols - 1)
  const row = Math.max(0, Math.floor(from / cols) + Math.round(dy / stepY))
  return clamp(row * cols + col, 0, count - 1)
}

// The held tile's offset from the slot it has now, so it stays under the pointer while the others make room.
export function heldOffset ({ from, to, cols, dx, dy, stepX, stepY }) {
  return {
    x: dx - (to % cols - from % cols) * stepX,
    y: dy - (Math.floor(to / cols) - Math.floor(from / cols)) * stepY
  }
}

// The grid for this many tiles across this much room: two rows, but never fewer than three across; tiles at most
// 34 high, 4 apart. Given a tile size, square tiles of that size, as many across as fit, whatever the count; given
// a count across instead, square tiles that fill the room that many across.
export function gridFor (count, room, tile = null, across = null) {
  if (across) { const w = (room - (across - 1) * GAP) / across; return { cols: across, w, h: w } }
  if (tile) return { cols: Math.max(1, Math.floor((room + GAP) / (tile + GAP))), w: tile, h: tile }
  const cols = Math.max(3, Math.floor((count + 1) / 2))
  const w = Math.max(20, (room - (cols - 1) * GAP) / cols)
  return { cols, w, h: Math.min(34, w) }
}

export function placeOf (i, { cols, w, h }) {
  return { x: (i % cols) * (w + GAP), y: Math.floor(i / cols) * (h + GAP) }
}

// The sidebar's styles (ADR 0015). Classic: rows 28 tall; List: rows 40 tall, title over address; Tiles: cards
// two across. Each is a row step (its height and 2 or 4 between) and an
// Essentials tile size or count across (neither: Classic's stretching grid). Tiles keeps Classic's rows for the label and pinned tabs.
export const SIDE_STYLES = {
  classic: { step: 30, tile: null },
  list: { step: 42, tile: 36 },
  tiles: { step: 30, tile: null, across: 4 }
}
const CARD = 76
const CARD_GAP = 6

/** The step from one card to the next across and down, in Tiles, for this much room. */
export const cardSteps = room => ({ x: (room - CARD_GAP) / 2 + CARD_GAP, y: CARD + CARD_GAP })

/** Where slot i of the tabs sits under "New tab": its top, and for Tiles its left, width and height too. */
export function slotPlace (i, style, room) {
  const { step } = SIDE_STYLES[style]
  if (style !== 'tiles') return { top: (i + 1) * step }
  const width = (room - CARD_GAP) / 2
  return { top: step + Math.floor(i / 2) * (CARD + CARD_GAP), left: (i % 2) * (width + CARD_GAP), width, height: CARD }
}

/** How tall the tabs' box is with this many slots under the label. */
export function slotsHeight (count, style) {
  const { step } = SIDE_STYLES[style]
  if (style !== 'tiles' || !count) return (count + 1) * step - 2
  return step + Math.ceil(count / 2) * (CARD + CARD_GAP) - CARD_GAP
}

// Tiles shows pinned tabs as a launcher: the site's mark on a square with its name under it, at least three across.
const PIN = { min: 52, h: 58, gap: 6 }
const pinCols = room => Math.max(3, Math.floor((room + PIN.gap) / (PIN.min + PIN.gap)))

/** The step from one launcher pin to the next across and down, and how many across, for this much room. */
export const pinSteps = room => {
  const cols = pinCols(room)
  return { x: (room - (cols - 1) * PIN.gap) / cols + PIN.gap, y: PIN.h + PIN.gap, cols }
}

/** Where pinned tab i sits in its box: a row under the last in every style but Tiles, a launcher cell there. */
export function pinPlace (i, style, room) {
  if (style !== 'tiles') return { top: i * SIDE_STYLES[style].step }
  const { x, y, cols } = pinSteps(room)
  return { top: Math.floor(i / cols) * y, left: (i % cols) * x, width: x - PIN.gap, height: PIN.h }
}

/** How tall the pinned tabs' box is. */
export function pinsHeight (count, style, room) {
  if (!count) return 0
  if (style !== 'tiles') return count * SIDE_STYLES[style].step - 2
  return Math.ceil(count / pinCols(room)) * (PIN.h + PIN.gap) - PIN.gap
}
