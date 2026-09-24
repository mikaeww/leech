// Chromium gives chrome://leech chrome.send; Electron doesn't.
if (window.chrome?.send) import('./native.js')
else import('./app.js')
