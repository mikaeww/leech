# Verification: passwords in the Chromium build

Component: `chromium/leech/passwords/leech_passwords.*`, `ui/native.js` (`vault`, `importCSV`), the Passwords
panel (`ui/panels/passwords.js`). Decision: [ADR 0011](../decisions/chromium/0011-passwords-in-leech-panel.md).

## Claims

1. `list` returns exactly the accounts Chromium keeps for web sites in the profile store: one entry per site and
   username, none missing, none extra, no password in it.
2. `reveal` returns the password Chromium keeps for that site and username, unchanged.
3. `save` of a new account adds exactly that account; `save` of a kept account with another password changes
   only its password; both are in Chromium's store.
4. `forget` removes exactly that account from Chromium's store.
5. `import` adds every valid row of the CSV that isn't kept yet, and leaves an account kept with another
   password as it was.

## Oracles

- Claims 1, 3, 4, 5: the profile's `Login Data` SQLite file (`logins`: `origin_url`, `username_value`), read with
  `node:sqlite` from a copy after Chromium has written it. It shares no code with the bridge.
- Claims 2, 3, 5 (the secrets): the passwords the check itself typed or wrote into the CSV, known before.

## Method and corpus

Example tests against the oracle in `check:ui passwords-panel --chromium`: a throwaway profile in a private Xvfb
(`--password-store=basic`); accounts added through the panel's form, one changed, one removed, a CSV with
new rows, a row for a kept account with another password and an invalid row handed to the panel's file input (the
chooser itself is Chromium's dialog, checked once by hand: it opens in the private display and Escape answers null).

Threshold: 100 % of the accounts in `Login Data` listed, every reveal equal to the known password, the conflicting
account's password unchanged.

## Results

2026-10-04, Chromium 154.0.8037.57 build (`out/Leech`), throwaway profile in a private Xvfb, `check:ui
passwords-panel --chromium`:
- Claim 1: three accounts added through the form, one at `https://www.beta.example/login`; `Login Data` held exactly
  those three, the panel listed the same three with `www.` dropped (3 of 3).
- Claim 2: every reveal equal to the password typed or written into the CSV (5 of 5), Show in the panel included.
- Claim 3: a new password for a kept account answered `updated`, the same again `same`; `Login Data` still held three.
- Claim 4: forgetting `beta.example|bea` left exactly the other two, `www.beta.example|ben` on the same site kept.
- Claim 5: the CSV's new row came in, its invalid row did not, the kept account kept `pw-alpha-2` over the file's
  password; a file without a password header answered "That file is not a password CSV".
- By hand, with no session bus so no desktop portal: the chooser opened as "Open File" in the private display,
  Escape closed it and the import answered null.

Threshold met on every claim.

## Known gaps

- Android and federated sign-ins, passkeys and the account store are not listed; Leech has no sync.
- `Login Data` holds the passwords encrypted, so the secrets are checked through the bridge, not the file.
