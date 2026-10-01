# 2026-10-01: Clear, suggestions in a tab's address

Hand-off for the next agent. Historical: the state at the end of this session.

## Asked

A Clear Tabs button; clicking a tab's name to type a new search or address, more easily.

## Done (each committed and pushed)

- fa10aa5: typing in the tab's own address field turned the site card away; it now shows the omnibox's
  suggestions (`offersFor`, `askEngine`, `offerHTML` exported from `page/omnibox.js`), arrows pick, Enter or
  click goes. `.site-card` joined the islands in `native.js`, so it takes clicks over the page in Chromium.
- 60f3a65: Clear at the end of the "New tab" row (sidebar hover) and Clear Tabs in the ⋯ menu;
  `clearTabs` in `tabs/archive.js` closes loose tabs outside folders into the archive, keeping pages with
  unsent input; private tabs are not archived.

## Not done, on purpose

- A tab that is not on screen still takes one click to be chosen and a second to edit its address; making the
  first click edit would leave no way to just switch tabs.
- The tab field has no inline completion (the omnibox's grey ending); the suggestion list covers it.
- No undo for Clear beyond Archived Tabs and Ctrl+Shift+T (the last 12).
- Not run in the Chromium build this session: the engine's own suggestions and the card's island are only
  reachable there.
