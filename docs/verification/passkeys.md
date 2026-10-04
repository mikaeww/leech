# Verification: passkeys

Component: `chromium/leech/passkeys/` (store, responses, request proxy), `ui/passkeys/` (the sheet and the
setup). Decision: [ADR 0009](../decisions/chromium/0009-own-passkeys.md). Chromium build only.

## Claims

1. A passkey made on a page is a valid WebAuthn registration: the attestation object is CBOR with fmt "none",
   its authenticator data's RP ID hash is SHA-256 of the RP ID, flags UP, UV and AT are set and BE, BS are not,
   the credential id matches the response's id, and the credential public key is an ES256 COSE key equal to
   the response's SPKI. The client data is `webauthn.create` with the request's challenge and the page's
   origin.
2. A sign-in with it returns an assertion whose signature verifies with that public key over
   authenticatorData ‖ SHA-256(clientDataJSON); flags UP and UV, client data `webauthn.get`, the user handle is
   the one given at creation.
3. `Leech Passkeys.json` holds no private key in the clear: each key opens with AES-256-GCM under the scrypt
   key of the PIN and the file's salt, with credential id followed by the RP ID as associated data, and is the
   private half of the credential's public key. With a wrong PIN nothing opens.
4. A wrong PIN in the sheet signs nothing and says so; the right one then works.
5. A request whose excludeCredentials names a passkey Leech holds for the site ends in InvalidStateError.
6. Changing the PIN keeps every passkey usable with the new PIN only.
7. Removing a passkey removes it from the file and from sign-in.

## Oracles

- Claims 1, 2: Node's `crypto` (OpenSSL) in the check, decoding the CBOR by hand and verifying the DER
  signature; it shares no code with Chromium's BoringSSL or `device/fido`.
- Claim 3: Node's `crypto.scrypt` and AES-256-GCM over the file, with the parameters the ADR states, and
  `createPublicKey` of the opened key compared with the credential's SPKI.
- Claims 4–7: the page's own promise results (`DOMException` names) and the file.

## Method and corpus

Example tests in `npm run check:ui -- --chromium` (`passkeys`): a local page on `http://localhost` (a secure
context and a valid RP ID) runs create and get with a fixed challenge; the UI's sheet is answered through the
UI's target as a person would, typing the PIN. Claims 1–3 are checked on every created passkey (two
users), claim 2 on every sign-in.

## Results (2026-10-04)

`npm run check:ui passkeys -- --chromium` passes: two passkeys made (claims 1, 3, 5), a sign-in after a wrong
PIN (2, 4), the PIN changed (6), one removed (7). Every claim held on every case; the corpus is the scenario's
fixed requests.

## Known gaps

- "Phone or key…", stepping aside and a request from a second window are not exercised.
- Sites on other RP IDs are not exercised: content's RP ID check (Chromium's) keeps a page from asking for
  another site's ID, and which passkeys the sheet offers is by exact RP ID, read in code review.
- Cross-origin frames and conditional requests are refused by design (ADR 0009) and not exercised.
- Timing of scrypt (about 0.1 s on this machine) is noted, not checked.
