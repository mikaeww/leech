// The token check: in ui/styles and its folders, every colour, font size, radius and spacing comes from tokens.css.
// A deliberate exception carries /* raw: why */ on the same line.
import fs from 'node:fs'
import path from 'node:path'

const TOKEN_FILE = 'tokens.css'
const SPACING = /^(margin|padding|gap|row-gap|column-gap)(-(top|right|bottom|left|inline|block))?$/
const COLOURED = /^(color|background(-color|-image)?|fill|stroke|caret-color|accent-color|text-shadow|border(-[a-z]+)?|outline(-color)?)$/
const COLOUR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\((?!from var)|\b(white|black|red|blue|green|gray|grey)\b/i

function lengthsOutsideScale (value) {
  const bare = value.replace(/var\([^)]*\)/g, '').replace(/calc\([^;]*\)/g, '')
  return /(^|[\s,(])-?\d*\.?\d+(px|em|rem)\b/.test(bare)
}

/** One declaration against the rules; returns what is wrong, or null. */
export function judge (property, value) {
  const v = value.trim()
  if (/^mask/.test(property)) return null
  if (COLOURED.test(property) && COLOUR.test(v)) return `raw colour "${v}"`
  if (property === 'font-size' && !/^(var\(--fs-[a-z]+\)|inherit)$/.test(v)) return `font size "${v}" is not a --fs token`
  if (property === 'font' && v !== 'inherit' && !/var\(--fs-[a-z]+\)/.test(v)) return `font "${v}" has no --fs token`
  if (property === 'border-radius' && !/^(0|var\(--r[a-z-]*\)|calc\(.*var\(--r.*\))$/.test(v)) return `radius "${v}" is not a --r token`
  if (SPACING.test(property) && lengthsOutsideScale(v)) return `spacing "${v}" is not on the --s scale`
  if (property === 'box-shadow' && v !== 'none') return 'shadows give no depth here; use a --raise step'
  if (/^border(-(top|right|bottom|left))?$/.test(property) && !/^(0|none)$/.test(v)) return 'borders give no structure here; use space'
  if (/^outline$/.test(property) && !/^(0|none)$/.test(v)) return 'outlines give no structure here'
  return null
}

/** Every declaration of one stylesheet, with its line and whether it is marked raw. */
export function declarations (text) {
  const out = []
  let inComment = false
  text.split('\n').forEach((raw, i) => {
    const marked = raw.includes('/* raw:')
    let line = ''
    for (let k = 0; k < raw.length; k++) {
      if (!inComment && raw.startsWith('/*', k)) { inComment = true; k++; continue }
      if (inComment && raw.startsWith('*/', k)) { inComment = false; k++; continue }
      if (!inComment) line += raw[k]
    }
    for (const m of line.matchAll(/([a-z-]+)\s*:\s*([^;{}]+?)\s*(?=;|}|$)/g)) {
      if (/^(hover|not|has|is|focus|root|where)$/.test(m[1])) continue
      out.push({ line: i + 1, property: m[1], value: m[2], marked })
    }
  })
  return out
}

const sheets = dir => fs.readdirSync(dir, { recursive: true }).filter(n => n.endsWith('.css'))

export function inspect (dir) {
  const problems = []
  for (const name of sheets(dir).filter(n => n !== TOKEN_FILE)) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8')
    for (const d of declarations(text)) {
      const wrong = !d.marked && judge(d.property, d.value)
      if (wrong) problems.push(`${name}:${d.line}: ${d.property}: ${wrong}`)
    }
  }
  return problems
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../ui/styles')
  const problems = inspect(dir)
  for (const p of problems) console.error(`tokens: ${p}`)
  console.log(`tokens: ${sheets(dir).length - 1} stylesheets checked against ${TOKEN_FILE}`)
  process.exitCode = problems.length ? 1 : 0
}
