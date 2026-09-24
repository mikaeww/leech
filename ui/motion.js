// Search has three curves: glide and settle are SwiftUI springs, quick is a 0.14 s ease-out.
// Springs become CSS linear() easings sampled from the damped oscillator, so plain transitions carry them.

function spring (response, damping) {
  const omega = 2 * Math.PI / response
  const decay = damping * omega
  const wd = omega * Math.sqrt(1 - damping * damping)
  const x = t => 1 - Math.exp(-decay * t) * (Math.cos(wd * t) + (decay / wd) * Math.sin(wd * t))
  let duration = 0.05
  while (duration < 3 && Math.abs(1 - x(duration)) + Math.exp(-decay * duration) > 0.002) duration += 0.01
  const steps = 48
  const points = Array.from({ length: steps + 1 }, (_, i) => x(duration * i / steps).toFixed(4))
  points[steps] = '1'
  return { easing: `linear(${points.join(', ')})`, ms: Math.round(duration * 1000) }
}

export const glide = spring(0.34, 0.82)
export const settle = spring(0.30, 0.86)

const root = document.documentElement.style
root.setProperty('--glide', glide.easing)
root.setProperty('--glide-ms', `${glide.ms}ms`)
root.setProperty('--settle', settle.easing)
root.setProperty('--settle-ms', `${settle.ms}ms`)
