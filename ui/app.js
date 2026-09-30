// The window's entry: every part is wired up by importing it; this starts the first session.
import './look/theme.js'
import './chrome/doors.js'
import { render } from './chrome/render.js'
import { actions } from './keys.js'
import { L, prefs, S, savedSession, sessionName, tabs, ui } from './state.js'
import { foldersFrom, tidy } from './tabs/folders.js'
import { rowFrom } from './tabs/spaces.js'
import { select } from './tabs/tabs.js'

// F11: the window takes the screen and the tabs fold away until the pointer reaches the edge.
L.onFullscreen(on => {
  ui.full = on
  ui.peeking = false
  render()
})

const firstSession = S.space === 'personal' ? savedSession : await L.read(sessionName(S.space))
tabs.push(...rowFrom(firstSession, S.space))
S.folders = foldersFrom(firstSession)
tidy()
render()
select(tabs[Math.min(firstSession?.active || 0, tabs.length - 1)].id)

if (!prefs.welcomed) actions.welcome()
