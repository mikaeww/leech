// The structure check from docs/conventions.md: what ESLint can't see across files and languages.
import fs from 'node:fs'
import path from 'node:path'

export const LIMITS = { lines: 500, codePerDir: 8, docsPerDir: 8, depth: 4 }
const SKIPPED = new Set(['.git', 'node_modules', 'dist'])
// Machine-written by npm.
const GENERATED = new Set(['package-lock.json'])
const CODE = /\.(js|mjs|cc|h|css|html)$/
const ENTRIES = new Set(['start.js', 'index.html', 'main.js', 'index.js'])
const FORBIDDEN = /^(utils?|helpers?|misc|common|stuff|shared)$/
// Each component folder says what it is for; the check keeps that true.
export const COMPONENTS = ['ui', 'electron', 'chromium', 'tools']

function isText (file) {
  const fd = fs.openSync(file, 'r')
  try {
    const head = Buffer.alloc(8000)
    const n = fs.readSync(fd, head, 0, head.length, 0)
    return !head.subarray(0, n).includes(0)
  } finally {
    fs.closeSync(fd)
  }
}

function lineCount (file) {
  const text = fs.readFileSync(file, 'utf8')
  return text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

function checkFile (root, file, problems) {
  const rel = path.relative(root, file)
  const stem = path.basename(file).replace(/\..*$/, '')
  if (FORBIDDEN.test(stem)) problems.push(`${rel}: "${stem}" names no concept`)
  if (GENERATED.has(path.basename(file)) || !isText(file)) return false
  const lines = lineCount(file)
  if (/\.(js|mjs|cc|h|css)$/.test(file) && !/^(\/\/|\/\*)/.test(fs.readFileSync(file, 'utf8'))) problems.push(`${rel}: doesn't open with a comment saying what it is for`)
  if (lines > LIMITS.lines) problems.push(`${rel}: ${lines} lines, the limit is ${LIMITS.lines}`)
  return true
}

function checkDir (root, dir, names, problems) {
  const rel = path.relative(root, dir) || '.'
  const inTests = rel.split(path.sep).includes('test')
  const code = names.filter(n => CODE.test(n) && !ENTRIES.has(n) && !/\.test\.m?js$/.test(n))
  if (!inTests && code.length > LIMITS.codePerDir) problems.push(`${rel}/: ${code.length} code files, the limit is ${LIMITS.codePerDir}`)
  const docs = names.filter(n => n.endsWith('.md'))
  if (rel.split(path.sep)[0] === 'docs' && docs.length > LIMITS.docsPerDir) problems.push(`${rel}/: ${docs.length} documents, the limit is ${LIMITS.docsPerDir}`)
  const [top, ...below] = rel.split(path.sep)
  if (COMPONENTS.includes(top) && below.length > LIMITS.depth) problems.push(`${rel}/: ${below.length} levels deep, the limit is ${LIMITS.depth}`)
  if (FORBIDDEN.test(path.basename(dir))) problems.push(`${rel}/: "${path.basename(dir)}" names no concept`)
}

/** Walks the project without following symlinks; returns the problems and what was looked at. */
export function inspect (root) {
  const problems = []
  const covered = { files: 0, dirs: 0, skipped: 0 }
  const walk = dir => {
    covered.dirs++
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    checkDir(root, dir, entries.filter(e => e.isFile()).map(e => e.name), problems)
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isSymbolicLink() || (e.isDirectory() && SKIPPED.has(e.name))) covered.skipped++
      else if (e.isDirectory()) walk(full)
      else if (e.isFile()) checkFile(root, full, problems) ? covered.files++ : covered.skipped++
    }
  }
  walk(root)
  for (const name of COMPONENTS) {
    if (fs.existsSync(path.join(root, name)) && !fs.existsSync(path.join(root, name, 'README.md'))) problems.push(`${name}/: no README.md`)
  }
  return { problems, covered }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
  const { problems, covered } = inspect(root)
  for (const p of problems) console.error(`structure: ${p}`)
  console.log(`structure: ${covered.files} text files in ${covered.dirs} folders checked, ${covered.skipped} skipped (binary, generated, symlinks, dependencies)`)
  process.exitCode = problems.length ? 1 : 0
}
