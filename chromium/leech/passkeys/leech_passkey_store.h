// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_PASSKEYS_LEECH_PASSKEY_STORE_H_
#define CHROME_BROWSER_UI_LEECH_PASSKEYS_LEECH_PASSKEY_STORE_H_

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "base/containers/span.h"

// The passkeys Leech keeps (ADR 0009) and the file they live in. What a site and the settings need to see is
// readable; each private key is sealed under a key derived from the PIN. Not for the request flow: that is
// leech_passkey_proxy.

struct LeechPasskey {
  LeechPasskey();
  LeechPasskey(const LeechPasskey&);
  LeechPasskey& operator=(const LeechPasskey&);
  ~LeechPasskey();

  std::vector<uint8_t> credential_id;
  std::string rp_id;
  std::vector<uint8_t> user_id;
  std::string user_name;
  std::string display_name;
  // Milliseconds since the epoch.
  double created = 0;
  // nonce ‖ AES-256-GCM(PKCS#8 private key), with credential id ‖ RP ID as associated data.
  std::vector<uint8_t> sealed_key;
};

struct LeechPasskeyVault {
  LeechPasskeyVault();
  LeechPasskeyVault(const LeechPasskeyVault&);
  LeechPasskeyVault& operator=(const LeechPasskeyVault&);
  ~LeechPasskeyVault();

  bool set_up() const { return !salt.empty(); }

  // scrypt's salt for the PIN; empty until a PIN is chosen.
  std::vector<uint8_t> salt;
  // A known text sealed under the PIN's key: opening it is how a PIN is checked.
  std::vector<uint8_t> check;
  std::vector<LeechPasskey> passkeys;
};

using LeechPinKey = std::array<uint8_t, 32>;

// nullopt for a file that isn't Leech's passkey file; the caller keeps it rather than overwriting it.
std::optional<LeechPasskeyVault> ParseVault(std::string_view json);
std::string SerializeVault(const LeechPasskeyVault& vault);

// These run scrypt (about 0.1 s): never on the UI thread.
LeechPinKey KeyFromPin(std::string_view pin, base::span<const uint8_t> salt);
// A fresh salt and check for `pin`, with no passkeys.
LeechPasskeyVault NewVault(std::string_view pin);
// The PIN's key when `pin` opens the vault's check.
std::optional<LeechPinKey> UnlockVault(const LeechPasskeyVault& vault, std::string_view pin);

std::vector<uint8_t> SealKey(const LeechPinKey& key, const LeechPasskey& passkey, base::span<const uint8_t> pkcs8);
std::optional<std::vector<uint8_t>> OpenKey(const LeechPinKey& key, const LeechPasskey& passkey);

// Every key opened with the old PIN and sealed again under the new one; nullopt when the old PIN is wrong.
std::optional<LeechPasskeyVault> ChangePin(const LeechPasskeyVault& vault, std::string_view old_pin,
                                           std::string_view new_pin);

#endif  // CHROME_BROWSER_UI_LEECH_PASSKEYS_LEECH_PASSKEY_STORE_H_
