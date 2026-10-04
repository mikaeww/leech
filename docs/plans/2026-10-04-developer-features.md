# Plan: tools for developers (2026-10-04)

The features the owner asked for, in the order they are built: related tabs, sorted downloads, sandboxes, a Dev
UI, then the downloads and sandbox panels. Each is its own phase with its own commit.

## 1. Related tabs

**Result.** A tab that is home to a repository or a package (GitHub, GitLab, Codeberg, Bitbucket, sourcehut,
npm, PyPI, crates.io) keeps the tabs about it right under it: its own issues and pages, links opened from it,
and any page whose address or title names it as a word (docs, a question, a video). In the sidebar they are set
in like a folder's tabs. Settings › Tabs › "Keep related tabs together", on by default.

**Implementation.** `ui/places/sorting/topics.js` (pure: `topicOf`, `belongs`), `ui/tabs/groups/related.js`
(`relations()` derived from the tabs on every render; `keepTogether(t)` moves a tab once, when it first comes to
belong to a root). Nothing new in the session: the relation is worked out again from addresses and titles.

**Checks.** `test/places.test.mjs`; `check:ui related` in both shells.

**Limits.** Names shorter than three letters or on a small list of common words relate nothing. Only loose tabs
take part; pinned, essential and folder tabs keep their places.

## 2. Sorted downloads

**Result.** Settings › Downloads › "Sort into folders": a finished download lands in `Images`, `Documents`,
`Code`, `Installers` or `Other` under the downloads folder, by its file type. Off: as before. "Ask where to
save" wins over sorting.

**Implementation.** The kinds as one table in `ui/places/sorting/kinds.js`, sent to the shell with `configure`.
Electron sorts in `electron/downloads.js`. Chromium: `chromium/leech/downloads/leech_downloads.*` keeps the table
and `download_target_determiner.cc` (one call in the patch) asks it for the subfolder.

**Checks.** Unit test of the table; `check:ui downloads-sorted` in both shells (a served file lands in its folder).

## 3. Sandboxes (Chromium build)

**Result.** "Open in Sandbox" (tab menu, link menu, ⋯ menu) opens the page in a new window with a fresh
off-the-record profile: its own cookies, storage, cache, permissions and extensions, nothing written to disk,
all gone when the window closes. The window's UI says it is a sandbox, restores no session and opens only that
page. The Electron shell has no sandbox and shows no entry (as with extensions).

**Why a window and not a tab.** A tab can get its own storage partition, but Chromium keeps permissions per
profile, so camera or notification answers would leak between a sandbox and normal tabs. A unique
off-the-record profile isolates all of it and is what DevTools' `Target.createBrowserContext` uses.

**Checks.** `check:ui sandbox --chromium`: a cookie set in the sandbox is not in the main window and the other
way round; the sandbox writes nothing over the session; a second sandbox starts without the first one's cookie.
Decision in [ADR 0012](../decisions/chromium/0012-sandbox-windows.md) (a DevTools context, since only those may
have windows besides the primary incognito profile).

## 4. Dev UI (Chromium build)

**Result.** Settings › General › "Dev UI" (also in the ⋯ menu). On, the tabs go across the top with the doors and
settings at the right, and a column of tools sits left of the page, the page's address under the tool names:
Explorer (a folder chosen in Chromium's chooser: tree, editor, Ctrl+S, save and reload the page), Console (the
page's logs, errors and the browser's warnings, a line that runs JavaScript in the page), Network (every request
as "GET /api/users 200 124 ms", filter and kinds, headers, bodies, Send again, Edit and send, Copy as cURL),
Elements (the DOM tree, a picker, attributes, outer HTML and computed styles, each changeable), Storage (cookies
with every flag, local and session storage, each editable, Clear site data after asking) and Security (a passive
check, worst first: TLS, HSTS, CSP, framing, nosniff, versions in headers, CORS, cookie flags, mixed content,
password forms, the certificate, source maps).

**Implementation.** [ADR 0013](../decisions/chromium/0013-dev-ui-over-devtools-protocol.md). The DevTools protocol
bridge in C++ (`chromium/leech/dev/`), the folder access in `chromium/leech/files/leech_folder.*`; the column in
`ui/dev/column.js`, the protocol client in `ui/dev/protocol.js`, one file per tool in `ui/dev/tools/`. The pure parts
are unit-tested: the security rules (`ui/dev/audit.js`), Send again and curl (`tools/replay.js`), console values
(`tools/values.js`). Claude was in the first plan and is left out (owner's decision, 2026-10-04).

**Checks.** `test/audit.test.mjs`, `test/replay.test.mjs`, `test/values.test.mjs`; `check:ui dev-ui --chromium` and
`dev-ui-dark`: the page's fetch in Network with its body and Send again, its log line and a typed answer in
Console, an attribute changed in Elements reaching the page, its cookie and local storage in Storage, the expected
findings worst first in Security, and in Explorer a folder not chosen refused, one chosen through GTK's chooser
listed, a file changed and saved to disk, a path outside it refused. GTK keeps its recent files in a data folder
inside the throwaway profile during the check.

**Limits.** Passive security checks only: no scanning, no fuzzing. Requests before the column attached are missing
until a reload. One tab at a time.

## 5. Downloads panel (both shells)

**Result.** The downloads door opens Leech's own panel in the Chromium build too, instead of `chrome://downloads`:
Smart download (the sorting switch) with where new files go, the latest five downloads each with the folder it
really landed in, and every folder downloads went to (all kind folders while sorting is on, empty ones too) that
opens to its files. Running downloads show their progress and can be paused, resumed and cancelled; the door's
ring follows them.

**Implementation.** `chromium/leech/downloads/leech_download_list.*` over Chromium's own list
(`AllDownloadItemNotifier`, changes sent at most four times a second); a folder is opened only inside the
downloads folder. Where a path landed is worked out in the UI (`ui/places/sorting/landed.js`, pure). Electron keeps
its list in main as before.

**Checks.** `test/landed.test.mjs`; `check:ui downloads-panel` in both shells. The check never opens a folder or a
file, since that would start the desktop's file manager outside the private display.

## 6. Sandbox panel (Chromium build)

**Result.** The "Sandbox" mark in a sandbox window is a button (also "This Sandbox…" in the ⋯ menu) opening a
panel that shows the separation instead of claiming it: the page's cookies here against the same site's in the
normal window, by count and name (never values), everything the sandbox holds site by site (cookies, storage
kinds, size), how long it has been open, and "Start over" (the page in a fresh sandbox, this window closed).
Read again every two seconds while open. A sandbox window says what it is in a toast when it opens.

**Implementation.** `chromium/leech/sandbox/leech_sandbox_report.*`: `BrowsingDataModel` over the sandbox profile,
the cookie manager of both profiles for the page.

**Checks.** `check:ui sandbox-panel --chromium`: no cookie here and the normal window's one there, then one set in
the sandbox counts and is named only on its side.
