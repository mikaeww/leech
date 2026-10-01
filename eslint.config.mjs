// ESLint for the whole repo: the style, and the size limits from docs/conventions.md.
import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'

// The limits from docs/conventions.md; the structure check covers what ESLint can't see.
const limits = {
  'max-lines': ['error', { max: 500 }],
  'max-lines-per-function': ['error', { max: 60 }],
  'max-params': ['error', { max: 5 }],
  'no-unused-vars': ['error', { caughtErrors: 'none' }],
  'no-empty': ['error', { allowEmptyCatch: true }]
}

// Window properties that read like app names: without their own import they would silently be the
// browser's (history.record is not a function), so they count as undefined.
const confusable = new Set(['history', 'open', 'close', 'find', 'print', 'stop', 'name', 'status', 'event', 'top',
  'parent', 'length', 'origin', 'blur', 'focus', 'scroll', 'self', 'screen', 'closed', 'frames', 'menubar', 'toolbar', 'external', 'confirm', 'alert', 'prompt'])
const browser = Object.fromEntries(Object.entries(globals.browser).filter(([name]) => !confusable.has(name)))

const style = stylistic.configs.customize({ indent: 2, quotes: 'single', semi: false, jsx: false, braceStyle: '1tbs', commaDangle: 'never' })

export default [
  { ignores: ['node_modules/', 'dist/'] },
  js.configs.recommended,
  style,
  {
    rules: {
      ...limits,
      '@stylistic/space-before-function-paren': ['error', 'always'],
      '@stylistic/max-statements-per-line': 'off',
      '@stylistic/operator-linebreak': 'off',
      '@stylistic/multiline-ternary': 'off',
      '@stylistic/arrow-parens': ['error', 'as-needed'],
      '@stylistic/quote-props': ['error', 'as-needed'],
      '@stylistic/object-curly-spacing': ['error', 'always']
    }
  },
  {
    files: ['ui/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...browser, chrome: 'readonly' } },
    // Inline style text escapes tools/tokens.mjs; a class in ui/styles keeps every value on the scales.
    rules: { 'no-restricted-properties': ['error', { property: 'cssText', message: 'Give the element a class in ui/styles instead.' }] }
  },
  {
    // The page script: each file runs inside a function (a preload, or leech_guest.cc's wrapper), styling the
    // page's own elements.
    files: ['ui/guest/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.browser },
    rules: { 'no-restricted-properties': 'off' }
  },
  {
    files: ['electron/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.node }
  }
]
