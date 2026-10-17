// The island's motion, ported from Coucou's core/anim.ts (github.com/Louis-CFM/coucou, MIT, © 2026 Louis Raillé;
// the notice is in LICENSE): growing is SwiftUI's spring(response, dampingFraction), stepped at 240 Hz so a
// dropped frame never upsets it; shrinking is a 340 ms curve with no overshoot, as Coucou's IslandContainer.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function cubicBezier (x1, y1, x2, y2) {
  const cx = t => ((1 - t) ** 2 * 3 * t * x1) + (3 * (1 - t) * t * t * x2) + t ** 3
  const cy = t => ((1 - t) ** 2 * 3 * t * y1) + (3 * (1 - t) * t * t * y2) + t ** 3
  return x => {
    let lo = 0
    let hi = 1
    let t = x
    for (let i = 0; i < 12; i++) {
      if (cx(t) < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return cy(t)
  }
}
const closeCurve = cubicBezier(0.45, 0, 0.2, 1)

class Spring {
  constructor (value) {
    this.value = value
    this.target = value
    this.velocity = 0
    this.configure(0.5, 0.72)
  }

  configure (response, damping) {
    this.omega = 2 * Math.PI / response
    this.zeta = damping
  }

  get settled () { return Math.abs(this.target - this.value) < 0.01 && Math.abs(this.velocity) < 0.05 }

  step (dt) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      const acc = this.omega * this.omega * (this.target - this.value) - 2 * this.zeta * this.omega * this.velocity
      this.velocity += acc * h
      this.value += this.velocity * h
    }
  }
}

/** One measure of the island (width, height, corner): a spring when it grows, a timed curve when it shrinks. */
export class Tracked {
  constructor (value) {
    this.spring = new Spring(value)
    this.mode = 'idle'
  }

  get value () { return this.spring.value }
  get animating () { return this.mode !== 'idle' }

  jump (v) {
    this.spring.value = this.spring.target = v
    this.spring.velocity = 0
    this.mode = 'idle'
  }

  springTo (v, response = 0.5, damping = 0.72) {
    this.spring.configure(response, damping)
    this.spring.target = v
    this.mode = 'spring'
  }

  curveTowards (v, ms = 340, now = performance.now()) {
    this.from = this.spring.value
    this.to = v
    this.start = now
    this.ms = ms
    this.spring.target = v
    this.spring.velocity = 0
    this.mode = 'curve'
  }

  step (dt, now = performance.now()) {
    if (this.mode === 'spring') {
      this.spring.step(dt)
      if (this.spring.settled) this.jump(this.spring.target)
    } else if (this.mode === 'curve') {
      const p = clamp((now - this.start) / this.ms, 0, 1)
      this.spring.value = this.from + (this.to - this.from) * closeCurve(p)
      if (p >= 1) this.jump(this.to)
    }
  }
}
