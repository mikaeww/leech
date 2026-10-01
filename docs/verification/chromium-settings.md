# Verification: Chromium settings bridge

Component: `chromium/leech/services/leech_prefs.*`, `ui/native.js` (`chromiumSettings`), the settings
panel's Chromium lines. Decision: [ADR 0004](../decisions/chromium/0004-chromium-settings.md).

## Claims

1. Reading returns, for every entry in the list, the value Chromium holds for it.
2. Writing an entry with an allowed value changes exactly that setting in Chromium, and it survives a restart.
3. Writing an unknown key, a wrong type or a value outside the entry's set changes nothing and is refused.

## Oracles

- Claims 1 and 2: Chromium's own `Default/Preferences` and `Local State` files, read as JSON after Chromium
  has written them (on exit). They share no code with the bridge.
- Claim 3: the same files, unchanged, and the bridge's answer.

## Method and corpus

Example tests against the oracle (the strongest method practical: the space is the list itself, so every
entry is covered, which makes it exhaustive over keys): a throwaway profile in a private Xvfb; for every
entry one allowed value different from the default is written through the bridge; Chromium quits; each
value is read back from the files. Then an unknown key, a wrong type and an out-of-range value are written
and the files checked unchanged.

Threshold: 100 % of the entries read back as written; 0 of the refused writes change a file.

## Results

2026-10-01, Chromium 154.0.8037.57 build, throwaway profile in a private Xvfb:
- The bridge read 25 entries (24 writable, `downloads-folder` read-only).
- 24 of 24 writes accepted; after Chromium quit, 24 of 24 values in `Default/Preferences` / `Local State`
  matched what was written, and the bridge's own read agreed (100 %, threshold met).
- 5 of 5 bad writes refused (unknown name, font size 13, a number for a switch, a path for the read-only
  folder, "ask" for pop-ups); the files kept the values from before.

## Known gaps

- The run is by hand (the Chromium build has no automated check).
- A setting outside the list is only reachable through the chrome://settings links.
