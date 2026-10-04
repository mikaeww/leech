# 0010: Addresses are kept encrypted

**Status:** accepted
**Date:** 2026-10-04

## Context
Chromium encrypts passwords and card numbers with os_crypt, but keeps saved addresses (name, street, phone,
email) as plain text in the profile's `Web Data`. A copy of the profile, a backup or a stolen disk hands them
out. The owner wants addresses kept like the rest.

## Options
1. **Leave it to disk encryption.** Nothing to carry, but nothing changes where the disk isn't encrypted.
2. **Encrypt the values in Chromium's address table**, with the same os_crypt encryptor that seals card
   numbers. A patch to `components/autofill/.../address_autofill_table.cc` to carry across Chromium updates.

## Decision
Option 2. Every value in `address_type_tokens` is written as os_crypt's ciphertext (a BLOB, like
`card_number_encrypted`) and decrypted on read. Values written before are TEXT: they are still read, and at
start every TEXT value is encrypted in one transaction (SQLite's secure_delete, on in Chromium, overwrites the
old bytes). A value that can't be encrypted fails the write instead of storing nothing; one that doesn't decrypt
(the keyring's key changed) leaves its address out and logs it, the rows staying on disk.

## Consequences
- Addresses are exactly as safe as passwords: with a Secret Service (`v11`) the key lives in the keyring; without
  one Chromium falls back to its fixed key (`v10`), which only obscures. Which one applies is not Leech's choice.
- Nothing searched addresses by value in SQL, so encrypting them breaks no query; this has to be checked again
  when the patch moves to a new Chromium.
- A profile opened by an unpatched Chromium can't read its addresses any more.
- Checked by `check:ui addresses --chromium`; the move from plain to encrypted was checked once by hand
  (a profile saved by the build before this, opened by this one: 40 of 40 values encrypted, none left in the
  file, the address read back whole).
