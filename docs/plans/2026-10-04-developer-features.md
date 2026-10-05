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

Built in 49f1274 and taken out again on the owner's word (2026-10-05):
[ADR 0013](../decisions/chromium/0013-dev-ui-over-devtools-protocol.md) is withdrawn, the code is in the history.

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

## Hand-off (2026-10-05)

`docs/handoffs/` is at its eight files, so this section stands in for a hand-off.

**State.** All six parts done and pushed: 077b1d2 (related tabs, sorted downloads), 667f149 (sandboxes), 74f83d7
(downloads and sandbox panels), 49f1274 (Dev UI, since taken out). The commit message of 74f83d7 says 42 unit tests; it was 36,
since the Dev UI's tests were set aside for that commit.

**Decisions.** The Dev UI is out again (owner, 2026-10-05; ADR 0013 withdrawn).

**Traps.** Never open a folder or file from a check (the desktop's file manager starts outside Xvfb).

**Next.** Open from the release plan: Widevine, Translate, AUR and the GitHub release.
