// The new tab's picture: a public-domain NASA photo, mostly black sky so the dots stay sparse,
// ordered-dithered live in the theme's two greys.
const PICTURES = [
  { file: 'earthrise.jpg', title: 'Earthrise', credit: 'NASA, Apollo 8' },
  { file: 'crescent-saturn.jpg', title: 'Crescent Saturn', credit: 'NASA/JPL-Caltech/Space Science Institute' },
  { file: 'blue-marble.jpg', title: 'The Blue Marble', credit: 'NASA, Apollo 17' },
  { file: 'earth-smiled.jpg', title: 'The Day the Earth Smiled', credit: 'NASA/JPL-Caltech/Space Science Institute' },
  { file: 'saturn.jpg', title: 'Saturn', credit: 'NASA/JPL-Caltech/Space Science Institute' },
  { file: 'crescents.jpg', title: 'Crescents Large and Small', credit: 'NASA/JPL/Space Science Institute' }
]
// Bayer 8x8, as thresholds in 0..1.
const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map(v => (v + 0.5) / 64)
// One dot is this many CSS pixels: coarse enough to read as dither, fine enough to stay a picture.
const DOT = 3

export function createBackdrop (stage) {
  const canvas = document.createElement('canvas')
  canvas.id = 'backdrop'
  const caption = document.createElement('p')
  caption.id = 'backdrop-credit'
  stage.prepend(canvas, caption)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  let index = -1
  try { index = Number(localStorage.getItem('leech.backdrop') ?? -1) } catch {}
  let picture = null
  let shown = false

  function draw () {
    if (!picture?.complete || !shown) return
    const w = Math.max(1, Math.round(stage.clientWidth / DOT))
    const h = Math.max(1, Math.round(stage.clientHeight / DOT))
    canvas.width = w
    canvas.height = h
    // Cover: fill the stage, crop what overhangs, centred.
    const scale = Math.max(w / picture.naturalWidth, h / picture.naturalHeight)
    const dw = picture.naturalWidth * scale
    const dh = picture.naturalHeight * scale
    ctx.drawImage(picture, (w - dw) / 2, (h - dh) / 2, dw, dh)
    const image = ctx.getImageData(0, 0, w, h)
    const style = getComputedStyle(document.documentElement)
    dither(image, rgb(style.getPropertyValue('--page')), rgb(style.getPropertyValue('--dots')))
    ctx.putImageData(image, 0, 0)
  }

  function next () {
    index = (index + 1) % PICTURES.length
    try { localStorage.setItem('leech.backdrop', String(index)) } catch {}
    const { file, title, credit } = PICTURES[index]
    caption.textContent = `${title} · ${credit}`
    picture = new Image()
    picture.onload = () => {
      draw()
      canvas.classList.remove('arriving')
      void canvas.offsetWidth
      canvas.classList.add('arriving')
    }
    picture.src = `backdrops/${file}`
  }

  let pending = 0
  new ResizeObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(draw) }).observe(stage)
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

  // A new picture for each blank tab that comes up, not on every render while it stays up.
  let tab = null
  return (on, id) => {
    shown = on
    stage.classList.toggle('blank', on)
    if (on && id !== tab) next()
    tab = on ? id : null
  }
}

// Each pixel becomes the lit or the unlit grey, by its brightness against the Bayer threshold.
function dither (image, [lr, lg, lb], [dr, dg, db]) {
  const { width: w, height: h, data: px } = image
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const on = px[i] / 255 > BAYER[(y & 7) * 8 + (x & 7)]
      px[i] = on ? dr : lr
      px[i + 1] = on ? dg : lg
      px[i + 2] = on ? db : lb
      px[i + 3] = 255
    }
  }
}

function rgb (color) {
  const hex = color.trim().replace('#', '')
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
}
