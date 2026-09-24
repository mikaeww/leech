// Line icons in the spirit of SF Symbols, drawn on a 24 grid (paths after Lucide, ISC).
const PATHS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  forward: '<path d="m9 18 6-6-6-6"/>',
  reload: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  stop: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  speaker: '<path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  muted: '<path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/><path d="m22 9-6 6M16 9l6 6"/>',
  eyeOff: '<path d="M10.7 5.1A10.7 10.7 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  minimize: '<path d="M6 12h12"/>',
  maximize: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  close: '<path d="M17 7 7 17M7 7l10 10"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>'
}

export function icon (name, size = 12, weight = 1.3) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${(weight * 24 / size).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`
}
