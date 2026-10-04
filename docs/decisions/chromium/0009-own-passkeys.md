# 0009: Leech keeps passkeys itself, behind a PIN

**Status:** accepted
**Date:** 2026-10-04

## Context
Search kept passkeys in the macOS keychain. Chromium on Linux has no platform authenticator: passkeys go to a
phone (hybrid, QR code), a security key, or Google Password Manager, which needs Google sign-in, sync and API
keys this build doesn't have. The owner wants Leech to keep passkeys itself, with a setup of its own and a PIN.

## Options
1. **A FIDO authenticator inside Chromium's request handling** (a `FidoDiscoveryFactory` platform
   authenticator). Sits beside phones and keys in one request, but means patching the request handler, its
   dialog model and its UI, the largest and most fragile part of the patch to carry across Chromium updates.
2. **The `webAuthenticationProxy` extension API** in a component extension. No C++, but private keys would live
   in extension storage and be handled in JavaScript, and the extension takes every request.
3. **Content's `WebAuthenticationRequestProxy`, answered by Leech in C++.** The embedder hook that the extension
   API itself is built on: `ChromeWebAuthenticationDelegate::MaybeGetRequestProxy` (one patched function) asks
   Leech first. Content has already checked the RP ID against the origin before it hands a request over.
   Keys stay in the browser process.

## Decision
Option 3. `chromium/leech/passkeys/` answers create and get requests itself:

- **When it answers.** Every request while passkeys are on (Settings › Passwords, on by default): content asks
  the proxy once per origin, not per kind of request, so Leech can't take creating and leave signing in. A
  request it took can't fall back within itself. So when Leech holds no passkey the site asked for, it ends the
  request with NotAllowedError, says so, and steps aside: the origin's requests for the next minute go to
  Chromium (phone, key). Its sheet's "Phone or key…" does the same on purpose.
- **Keys.** ES256 (P-256) only; each private key sealed with AES-256-GCM under a key scrypt derives from the
  PIN (N 2^15, r 8, p 1, a random 16-byte salt), the credential id and RP ID as associated data, a random
  96-bit nonce per seal. The file `Leech Passkeys.json` in the profile holds the sealed keys, outside `Leech/`,
  where the UI's own read and write can't reach it; sites, user names and credential ids are readable there, as
  sites and user names are in Chromium's password file. A file that doesn't parse is moved aside, never
  overwritten.
- **The PIN.** Chosen in a setup (Settings › Passwords, or the sheet when the first passkey is made), at least 6
  characters, letters allowed. It is asked on every create and every sign-in: it is the user verification, so
  responses carry UV. A wrong PIN signs nothing. Forgetting it means removing every passkey.
- **What sites see.** Attestation "none", Leech's own AAGUID, backup eligible and backed up both false (nothing
  syncs), sign count 0, attachment platform.
- **Not answered** (NotAllowedError with a message): requests from a cross-origin frame. Conditional
  (autofill) requests content refuses to hand to any proxy, so while passkeys are on they end in
  NotAllowedError on every site; the site's sign-in button still works.

## Consequences
- Passkeys made in Leech live on this computer only; losing the file or the PIN loses them. Export is not
  offered.
- The file is as strong as the PIN against someone who copies it: a 6-digit PIN falls to an offline search.
  The setup says so and suggests a longer one.
- While passkeys are on, a security key or phone takes a second try on the page (or "Phone or key…").
- One patched function in `chrome/browser/webauthn` and three GN lines; the rest is Leech's own code.
