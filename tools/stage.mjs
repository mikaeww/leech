// Lays out an installed Leech from a release build: `node tools/stage.mjs <chromium out dir> <prefix>` fills
// <prefix>/bin, <prefix>/lib/leech and <prefix>/share, the tree a package or tarball ships.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const [out, prefix] = process.argv.slice(2).map(p => p && path.resolve(p))
if (!out || !prefix) throw new Error('usage: node tools/stage.mjs <chromium out dir> <prefix>')

// What Chromium's own Linux installer ships (chrome/installer/linux/common/installer.py), minus the setuid
// sandbox: Arch has unprivileged user namespaces, so Chromium's namespace sandbox works without it.
const BINARIES = ['chrome', 'chrome_crashpad_handler']
const LIBRARIES = ['libEGL.so', 'libGLESv2.so', 'libvk_swiftshader.so', 'libvulkan.so.1', 'libqt5_shim.so', 'libqt6_shim.so']
const RESOURCES = ['resources.pak', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'icudtl.dat', 'v8_context_snapshot.bin', 'vk_swiftshader_icd.json']

const lib = path.join(prefix, 'lib', 'leech')
fs.rmSync(lib, { recursive: true, force: true })
fs.mkdirSync(path.join(lib, 'locales'), { recursive: true })

const copy = (from, to, mode = 0o644) => {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
  fs.chmodSync(to, mode)
}
for (const name of [...BINARIES, ...LIBRARIES]) {
  const from = path.join(out, name)
  if (!fs.existsSync(from)) {
    if (LIBRARIES.includes(name)) continue
    throw new Error(`${from} is missing: is this a finished release build?`)
  }
  copy(from, path.join(lib, name), 0o755)
  // Even at symbol_level = 0 the binary keeps a third of its size in symbols.
  execFileSync('strip', ['--strip-unneeded', path.join(lib, name)])
}
for (const name of RESOURCES) copy(path.join(out, name), path.join(lib, name))
for (const pak of fs.readdirSync(path.join(out, 'locales')).filter(n => n.endsWith('.pak'))) {
  copy(path.join(out, 'locales', pak), path.join(lib, 'locales', pak))
}
// The UI is read from disk beside the binary (UIFolder() in chromium/leech/leech_ui.cc).
fs.cpSync(path.join(root, 'ui'), path.join(lib, 'leech-ui'), { recursive: true })

copy(path.join(root, 'data', 'leech'), path.join(prefix, 'bin', 'leech'), 0o755)
copy(path.join(root, 'data', 'dev.mikaeww.Leech.desktop'), path.join(prefix, 'share', 'applications', 'dev.mikaeww.Leech.desktop'))
copy(path.join(root, 'assets', 'leech-light.png'), path.join(prefix, 'share', 'icons', 'hicolor', '256x256', 'apps', 'dev.mikaeww.Leech.png'))
copy(path.join(root, 'LICENSE'), path.join(prefix, 'share', 'licenses', 'leech', 'LICENSE'))
console.log(`stage: ${prefix}`)
