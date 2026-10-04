// A value from the page (the DevTools protocol's RemoteObject) said in one line, the way a console shows it.
// No DOM; tested in test/.

function property (p) {
  if (p.type === 'string') return JSON.stringify(p.value)
  if (p.type === 'object' && p.subtype !== 'null') return p.value || p.subtype || 'Object'
  return String(p.value)
}

/** One line for a value: strings bare, objects with their first properties, functions by their head. */
export function preview (o) {
  if (!o) return 'undefined'
  if (o.type === 'string') return o.value
  if ('unserializableValue' in o) return o.unserializableValue
  if (o.type === 'undefined') return 'undefined'
  if (o.subtype === 'null') return 'null'
  if (o.type !== 'object' && o.type !== 'function' && 'value' in o) return String(o.value)
  if (o.type === 'function') return (o.description || 'function').split('\n')[0]
  const p = o.preview
  if (!p) return o.description || o.className || 'Object'
  const more = p.overflow ? ', …' : ''
  if (p.subtype === 'array') return `${o.description} [${p.properties.map(property).join(', ')}${more}]`
  if (p.subtype === 'node' || p.subtype === 'error' || p.subtype === 'regexp' || p.subtype === 'date') return o.description
  const entries = p.properties.map(x => `${x.name}: ${property(x)}`)
  const name = o.className && o.className !== 'Object' ? `${o.className} ` : ''
  return `${name}{${entries.join(', ')}${more}}`
}
