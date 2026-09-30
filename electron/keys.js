// Keys taken before the page, then handed to the UI as actions.
const { state, send } = require('./window.js')

const SHORTCUTS = [
  ['ctrl+t', 'new-tab'], ['ctrl+shift+t', 'reopen'], ['ctrl+w', 'close-tab'], ['ctrl+shift+n', 'private-tab'],
  ['ctrl+l', 'edit'], ['alt+d', 'edit'], ['f6', 'edit'], ['ctrl+k', 'summon'],
  ['ctrl+r', 'reload'], ['f5', 'reload'], ['ctrl+f5', 'reload-hard'], ['shift+f5', 'reload-hard'],
  ['ctrl+shift+r', 'reader'], ['ctrl+shift+p', 'pip'],
  ['ctrl+[', 'back'], ['ctrl+]', 'forward'], ['alt+arrowleft', 'back'], ['alt+arrowright', 'forward'],
  ['ctrl+tab', 'next-tab'], ['ctrl+shift+tab', 'previous-tab'], ['ctrl+pagedown', 'next-tab'], ['ctrl+pageup', 'previous-tab'],
  ['ctrl+shift+]', 'next-tab'], ['ctrl+shift+[', 'previous-tab'], ['ctrl+shift+}', 'next-tab'], ['ctrl+shift+{', 'previous-tab'],
  ['ctrl+d', 'duplicate'], ['ctrl+alt+c', 'copy-address'], ['ctrl+shift+v', 'paste-and-go'],
  ['ctrl+f', 'find'], ['ctrl+g', 'find-next'], ['ctrl+shift+g', 'find-previous'], ['f3', 'find-next'],
  ['ctrl+shift+s', 'toggle-sidebar'], ['ctrl+s', 'fold'], ['ctrl+shift+m', 'mute'],
  ['ctrl+=', 'zoom-in'], ['ctrl++', 'zoom-in'], ['ctrl+shift++', 'zoom-in'], ['ctrl+-', 'zoom-out'], ['ctrl+0', 'zoom-reset'],
  ['ctrl+,', 'settings'], ['ctrl+h', 'history'], ['ctrl+y', 'history'], ['ctrl+j', 'downloads'],
  ['ctrl+shift+b', 'bookmark'], ['ctrl+shift+o', 'bookmarks'],
  ['ctrl+shift+h', 'veil'], ['ctrl+shift+u', 'hidden'],
  ['f11', 'fullscreen'], ['ctrl+o', 'open-file'], ['ctrl+u', 'view-source'],
  ['ctrl+shift+i', 'inspect'], ['f12', 'inspect'], ['ctrl+p', 'print'], ['ctrl+q', 'quit'],
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [`ctrl+${n}`, `tab-${n}`]),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [`alt+${n}`, `space-${n}`])
]
const shortcutMap = new Map(SHORTCUTS)

function chord (input) {
  const parts = []
  if (input.control) parts.push('ctrl')
  if (input.alt) parts.push('alt')
  if (input.shift) parts.push('shift')
  // Digits by physical key so Ctrl+1 works on every layout (Shift+1 is "!" on most).
  const digit = /^Digit(\d)$/.exec(input.code)
  parts.push(digit ? digit[1] : input.key.toLowerCase())
  return parts.join('+')
}

function watchKeys (contents) {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !state.win) return
    const action = input.key === 'Escape' && !input.control && !input.alt && !input.shift
      ? (state.escapable ? 'escape' : null)
      : state.veiling && chord(input) === 'ctrl+z' ? 'veil-undo' : shortcutMap.get(chord(input))
    if (!action) return
    event.preventDefault()
    send('shortcut', action)
  })
  contents.on('before-mouse-event', (event, mouse) => {
    if (mouse.type !== 'mouseDown' || !state.win) return
    if (mouse.button === 'back' || mouse.button === 'forward') {
      event.preventDefault()
      send('shortcut', mouse.button)
    }
  })
}

module.exports = { watchKeys }
