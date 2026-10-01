# 0004: Chromium's settings through an allowlist, the rest linked

**Status:** accepted
**Date:** 2026-10-01

## Context
The owner asked for Leech's settings to cover everything, Chromium's settings included. In the Chromium build
several Leech switches did nothing (offer to save passwords, ask where to save downloads), because Chromium
does those jobs itself now. chrome://settings has several hundred options and changes with every Chromium
release.

## Options
- Rebuild chrome://settings in Leech's design: complete, but hundreds of controls to keep in step with each
  Chromium version, most of them rarely touched.
- Embed chrome://settings in the panel: complete and current, but in Chromium's look, not Leech's.
- A bridge that reads and writes a fixed list of Chromium settings, shown as Leech's own lines, and a link to
  the matching chrome://settings section on every page for the rest.

## Decision
The third. `chromium/leech/services/leech_prefs.cc` holds the list: each entry names a profile pref, a
local-state pref or a site-permission default, its type and the values it may take. The UI can only read
the list and write an entry with an allowed value; anything else is refused and logged, never guessed.

## Consequences
- The settings that matter day to day are Leech lines in both looks; the long tail is one click away.
- A new Chromium setting in Leech means one entry in the list and one line in the UI.
- Electron has no such settings and shows none of these lines.
- Values are checked against Chromium's own Preferences file (docs/verification/chromium-settings.md).
