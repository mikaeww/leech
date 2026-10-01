// Starting points for the Colours page: whole paint settings with a name. Every colour stays changeable after;
// each window's text reads at 4.5:1 on all its colours (check:ui paint-presets).
export const PRESETS = [
  ['Grey', null],
  ['Leech', { window: { kind: 'gradient', colours: ['#0b2a6f', '#045af2', '#6544ee'], shape: 'linear', angle: 160 }, accent: '#045af2', dots: ['#045af2', '#22b8e8'] }],
  ['Sky', { window: { kind: 'gradient', colours: ['#cfe2ff', '#e6dcff', '#ffd9ec'], shape: 'linear', angle: 120 }, accent: '#4f6bed', dots: ['#7aa2f7', '#c99af0'] }],
  ['Dusk', { window: { kind: 'gradient', colours: ['#24164a', '#6e2b6a', '#b04462'], shape: 'linear', angle: 200 }, accent: '#b04462', dots: ['#7a5cff', '#ff7a9a'] }],
  ['Forest', { window: { kind: 'gradient', colours: ['#0e2a21', '#2b5a3c'], shape: 'radial' }, accent: '#3f8f5a', dots: ['#3f8f5a', '#b5d36b'] }],
  ['Ember', { window: { kind: 'gradient', colours: ['#3b0d0c', '#7a2416', '#b8441d'], shape: 'linear', angle: 135, dither: true }, accent: '#c4461f', dots: ['#e0582a', '#ffc15e'], dot: 5 }],
  ['Sand', { window: { kind: 'colour', colours: ['#ebe1d1'] }, accent: '#a35a1c', sheet: '#faf6ef', dots: ['#d6c2a0', '#c49a70'] }],
  ['Night', { window: { kind: 'colour', colours: ['#0b0d12'] }, accent: '#8ab4ff', sheet: '#12151c', dots: ['#2b3550', '#3d4f80'] }]
]
