// How the first run moves: pages gliding in from the side, and the mark's turn on the first Continue.
import { glide, reduced, turn } from '../look/motion.js'

/** Puts `next` on the stage; with a direction the old page leaves that way and the new one glides in. */
export function swapPage (stage, next, dir) {
  const old = stage.firstElementChild
  if (old && dir) {
    const far = reduced.matches ? 0 : 40 * dir
    old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-far}px)` }],
      { duration: glide.ms * 0.6, easing: glide.easing, fill: 'forwards' }).finished.then(() => old.remove())
    next.animate([{ opacity: 0, transform: `translateX(${far}px)` }, { opacity: 1, transform: 'none' }],
      { duration: glide.ms, easing: glide.easing })
  } else old?.remove()
  stage.append(next)
}

/**
 * The mark turns once round, rest to rest on the minimum-jerk curve, dipping in size on the way and sending
 * a wave out; resolves when it is exactly at rest. Turn and dip are separate properties, so the turn keeps
 * its curve. Reduced motion keeps the beat without the travel: the mark only dims and comes back.
 */
export async function turnMark (stage) {
  const mark = stage.querySelector('.w-mark')
  const wave = stage.querySelector('.w-wave')
  if (!mark) return
  if (reduced.matches) {
    await mark.animate([{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], { duration: 300, easing: 'ease-in-out' }).finished
    return
  }
  wave.animate([{ opacity: 0.9, scale: 0.8 }, { opacity: 0, scale: 2.6 }], { duration: turn.ms, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' })
  mark.animate([{ scale: 1, easing: 'ease-in-out' }, { scale: 0.88, offset: 0.3, easing: 'ease-in-out' }, { scale: 1 }], { duration: turn.ms })
  await mark.animate([{ rotate: '0deg' }, { rotate: '360deg' }], { duration: turn.ms, easing: turn.easing }).finished
}
