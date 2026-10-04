# Plan: tools for developers (2026-10-04)

Four features the owner asked for, in the order they are built: related tabs, sorted downloads, sandboxes, and
a Dev UI. Each is its own phase with its own commit.

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

**Result.** Settings › General › "Dev UI". On, the window turns into a developer's browser: the page on the
right, a tool column on the left with Explorer (a local folder: tree, editor, save), Console, Network (request
inspector: method, path, status, time, headers, bodies, replay), Elements, Storage (cookies with their flags,
local and session storage) and Security (headers, cookies, mixed content, certificate, forms, source maps), and
Claude. The address bar sits on top with the settings at its right.

**Implementation.** A DevTools protocol bridge in C++ (`chromium/leech/dev/`): the UI attaches to the tab on
screen and sends CDP commands, events come back. Every tool is JS in `ui/dev/` over that bridge. The Explorer
gets a folder chosen through Chromium's chooser; reads and writes stay inside it (checked in C++). Claude runs
as the local `claude` CLI with the owner's login, spoken to over its stdin and stdout in the SDK's stream-json
protocol: Leech is the host of an in-process MCP server (`type: "sdk"`), so Claude's tool calls arrive on the
same pipe and are answered by the UI, with no socket and no extra process (tried against Claude Code 2.1.280).
Its tools reach only the tab on screen and the opened folder; reading tools run at once, changing ones (running
script in the page, writing a file) ask the owner first.

**Checks.** Unit tests for the security checks (header and cookie rules); `check:ui dev-ui --chromium`.

**Limits.** Security checks are passive: they read what the page sent. No scanning, no fuzzing.
