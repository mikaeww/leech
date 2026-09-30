// Find in page.
import { render } from '../chrome/render.js'
import { $ } from '../elements.js'
import { icon } from '../look/icons.js'
import { current, ui } from '../state.js'
import { focusPage } from '../tabs/views.js'

const findBox = $('#find')
const findInput = $('#find input')
$('#find .up').innerHTML = icon('up', 'small')
$('#find .down').innerHTML = icon('down', 'small')
$('#find .close').innerHTML = icon('x', 'small')

export function openFind () {
  const t = current()
  if (!t?.ready || t.failure) return
  ui.finding = true
  findBox.hidden = false
  findInput.focus()
  findInput.select()
  render()
}

export function closeFind () {
  if (!ui.finding) return
  ui.finding = false
  findBox.hidden = true
  findBox.classList.remove('missed')
  current()?.ready && current().web.stopFindInPage('clearSelection')
  render()
  focusPage()
}

export function findStep (forward) {
  const t = current()
  if (!ui.finding) return openFind()
  if (t?.ready && findInput.value) t.web.findInPage(findInput.value, { forward, findNext: true })
}

findInput.addEventListener('input', () => {
  const t = current()
  if (!t?.ready) return
  if (findInput.value) t.web.findInPage(findInput.value)
  else { t.web.stopFindInPage('clearSelection'); findBox.classList.remove('missed') }
})
findInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') findStep(!e.shiftKey)
  else if (e.key === 'Escape') closeFind()
  else return
  e.preventDefault()
})
$('#find .up').addEventListener('click', () => findStep(false))
$('#find .down').addEventListener('click', () => findStep(true))
$('#find .close').addEventListener('click', closeFind)
