# Plan: the Passwords panel in the Chromium build (2026-10-04)

## Result
The Passwords door and Settings › Passwords open Leech's own Passwords panel in the Chromium build
too, over the page like History. It lists Chromium's saved accounts, searches them, reveals a password for 15 s,
copies, removes, adds by hand and brings in a CSV, all in Chromium's store ([ADR 0011](../decisions/chromium/0011-passwords-in-leech-panel.md)).
No Chromium password page opens from Leech any more.

## Implementation
1. `chromium/leech/passwords/leech_passwords.{h,cc}`: `SavedPasswordsPresenter` over the profile and account
   stores, initialised on the first call (calls wait for it); `PasswordImporter` for the CSV text. Added to
   `leech.patch`'s source list.
2. `leech_ui.cc`: the `passwords` call (`list`, `reveal`, `save`, `forget`, `import`) answered from it.
3. `leech_view.*`: `RunFileChooser` through `FileSelectHelper`, so the UI's file input opens Chromium's chooser.
4. `ui/native.js`: `vault` and `importCSV` call the bridge; the CSV is read in the UI from a file input.
5. `ui/panels/index.js` stops sending the passwords door to `chrome://password-manager`; Settings › Passwords
   and the panel's footer say where the passwords are kept in each shell.

## Checks
- `npm run check`; `npm run check:ui` (Electron) unchanged.
- New `passwords-panel` scenario, Chromium only, against `Login Data` ([verification plan](../verification/passwords.md)).
- `autoninja -C out/Leech chrome -j 5` (a third of the 16 cores) after the C++.

## What can break
- The presenter answers asynchronously; a call before it has loaded waits instead of answering empty.
- An import while one runs is refused by Chromium (`IMPORT_ALREADY_ACTIVE`); the UI says so.
- Revealing goes through Chromium's store each time; nothing is cached in the UI beyond the 15 s it is shown.

## Status (2026-10-04)
Done. `npm run check` passes; `check:ui` passes in Electron (24 scenarios) and with `--chromium` (28, the new
`passwords-panel` among them); results against `Login Data` in the [verification plan](../verification/passwords.md).
Found on the way: a password shown in the panel stayed shown after it changed; the panel now hides shown passwords
whenever the store changes. `leech_ui.cc` is at 500 lines, the limit: the next call there moves something out first.
Not checked: the Electron panel by hand (unchanged but for its footer and the no-op change event), the portal chooser
on a real desktop.
