// No native tooltips: a title becomes the element's aria-label the moment it is set, so screen readers keep the
// name and Chromium never shows its own tooltip, a window of its own in the system's font and frame (ADR 0015).
// An element that names itself with aria-label keeps that name; its title was only ever a tooltip.
const named = new WeakSet()

function untitle (el) {
  const text = el.getAttribute('title')
  if (text === null) return
  el.removeAttribute('title')
  if (el.hasAttribute('aria-label') && !named.has(el)) return
  named.add(el)
  if (text) el.setAttribute('aria-label', text)
  else el.removeAttribute('aria-label')
}

for (const el of document.querySelectorAll('[title]')) untitle(el)
new MutationObserver(changes => {
  for (const change of changes) {
    if (change.type === 'attributes') untitle(change.target)
    for (const node of change.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue
      untitle(node)
      for (const el of node.querySelectorAll('[title]')) untitle(el)
    }
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] })
