# 2026-10-01: What the Chromium build lacks

Asked: make everything that is dead in the Chromium build work, and from what was missing, keep splits across
a restart, keep a sleeping tab's back and forward, and make a tab's own address field better.

## Outcome

| What | After |
| --- | --- |
| The page script (`ui/guest/page.js`) | Runs in every page of the Chromium build too, and talks both ways |
| Reading progress, typed input, sign-in boxes, the element picker, shift-click peek | Work in the Chromium build, through the page script |
| Sleeping tabs | Fall asleep in the Chromium build; waking keeps back and forward (Chromium discards in place) |
| Archive | Takes idle tabs in the Chromium build too |
| Clear | Keeps a page that holds typed input and says so |
| Hidden elements | Kept by the UI (`places/hidden.js`) for both shells; the sheet goes into the page as it starts |
| Link peek | A page of its own over the stage in the Chromium build |
| Passwords | Chromium's own manager saves and fills, with its bubble reachable; checked in the build |
| Shield | Blocks Search's 44 hosts as third parties in the Chromium build and hides their boxes, paused per site |
| Splits | Come back after a restart |
| A tab's address field | Completes inline like the omnibox |

## Steps

1. Page script channel: the script moves to `ui/guest/page.js`; `chromium/leech/leech_guest.*` runs it in
   Chrome's internal isolated world on every committed page and long-polls a promise for its messages.
   Blink's isolated-world request awaits a promise (one-line patch). ADR 0005.
2. Hidden elements move into the UI; the shield's sheet rides along with the page script's config.
3. Sleep discards in place in the Chromium build; archive and Clear ask the page again.
4. Peek in the Chromium build.
5. Passwords: look at Chromium's save bubble and fill list in the build; anchor what has no anchor.
6. Shield blocking: dynamic declarativeNetRequest rules of a component extension. ADR 0006.
7. Splits in the session.
8. Inline completion in a tab's address field.

Each step: `npm run check`, `npm run check:ui`, the Chromium build run headless where it touches it, a commit.
