// The folder a download is sorted into, by its file type. No DOM; tested in test/. Both shells get the table
// through L.configure and sort with it themselves.
export const KINDS = [
  ['Images', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'heif', 'psd', 'xcf']],
  ['Documents', ['pdf', 'doc', 'docx', 'odt', 'ods', 'odp', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'epub', 'csv', 'tex']],
  ['Code', ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'c', 'h', 'cc', 'cpp', 'hpp', 'java', 'kt', 'rb', 'php', 'sh', 'fish', 'lua',
    'json', 'yaml', 'yml', 'toml', 'xml', 'html', 'css', 'sql', 'ipynb', 'patch', 'diff']],
  ['Installers', ['deb', 'rpm', 'appimage', 'flatpak', 'flatpakref', 'snap', 'exe', 'msi', 'dmg', 'pkg', 'apk', 'run']]
]
export const OTHER = 'Other'

/** The folder for a file name: by its last extension, Other when none fits. */
export function kindOf (name) {
  const ext = /\.([^./]+)$/.exec(name.toLowerCase())?.[1]
  return KINDS.find(([, exts]) => exts.includes(ext))?.[0] || OTHER
}
