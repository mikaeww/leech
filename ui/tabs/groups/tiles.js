// Where a tile carried across the Essentials grid lands, and where it is drawn while it is held; no DOM.

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
// 34 high, 4 apart.
export function gridFor (count, room) {
  const cols = Math.max(3, Math.floor((count + 1) / 2))
  const w = Math.max(20, (room - (cols - 1) * GAP) / cols)
  return { cols, w, h: Math.min(34, w) }
}

export function placeOf (i, { cols, w, h }) {
  return { x: (i % cols) * (w + GAP), y: Math.floor(i / cols) * (h + GAP) }
}
