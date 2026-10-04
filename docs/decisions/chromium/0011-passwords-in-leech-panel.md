# 0011: Passwords are shown in Leech's panel, kept in Chromium's store

**Status:** accepted
**Date:** 2026-10-04

## Context
The owner wants Chromium's interface used only as a backend, with Leech's own interface on top. In the Chromium
build the Passwords door opened `chrome://password-manager` as a tab, Chromium's own page inside Leech's stage,
and the CSV import went to that page's settings. The Electron shell already has Leech's Passwords panel (search,
reveal for 15 s, copy, remove, add, CSV import) over its own vault.

## Options
1. **Keep Chromium's page.** Nothing to build, but it is the Chromium interface the owner doesn't want.
2. **A store of Leech's own**, as in the Electron shell. Chromium's save bubble and filling would no longer see
   the passwords, or would keep a second copy.
3. **Leech's panel over Chromium's store**, through the classes `chrome://password-manager` itself uses:
   `SavedPasswordsPresenter` to list, add, edit and remove, `PasswordImporter` for the CSV, which Chromium parses
   in its own sandboxed utility process.

## Decision
Option 3. `chromium/leech/passwords/leech_passwords.*` answers five calls from the UI: `list` (host and username,
no secrets), `reveal`, `save` (added, or the password of an existing account changed), `forget` and `import` (the
CSV's text, into the profile store). The panel is the same in both shells. On an import, an account Chromium
already keeps with another password keeps it: nothing kept is overwritten by a file. The file is chosen with
Chromium's own chooser (`FileSelectHelper`, which `LeechView` now runs for the UI).

## Consequences
- `chrome://leech` can read every saved password, as `chrome://password-manager` can. Whatever can change the UI's
  folder on disk (`LEECH_UI_DIR`) already ran with the UI's power; this adds passwords to it. There is no extra
  authentication before a reveal, as in Chromium on Linux.
- Saving after a sign-in and filling stay Chromium's: its bubble at the stage's top right and its own filling.
  The panel's account list for a page (`matching`) stays empty in the Chromium build.
- The passwords are as safe as Chromium makes them: `v11` with a Secret Service, `v10` (a fixed key) without one.
- Checked by `check:ui passwords-panel --chromium` against the profile's `Login Data`
  ([verification plan](../../verification/passwords.md)).
