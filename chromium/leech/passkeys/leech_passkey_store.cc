// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/passkeys/leech_passkey_store.h"

#include <utility>

#include "base/base64.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/logging.h"
#include "base/values.h"
#include "crypto/aead.h"
#include "crypto/random.h"
#include "crypto/secure_util.h"
#include "third_party/boringssl/src/include/openssl/evp.h"

namespace {

// ADR 0009: scrypt N 2^15, r 8, p 1, about 32 MiB and 0.1 s per PIN; a 16-byte salt; a 96-bit nonce per seal.
constexpr uint64_t kScryptN = 1 << 15;
constexpr uint64_t kScryptR = 8;
constexpr uint64_t kScryptP = 1;
constexpr size_t kScryptMaxMemory = 64 * 1024 * 1024;
constexpr size_t kSaltLength = 16;
constexpr size_t kNonceLength = 12;
constexpr std::string_view kCheckText = "leech passkeys";
constexpr std::string_view kCheckData = "check";

std::vector<uint8_t> Bytes(std::string_view text) {
  return std::vector<uint8_t>(text.begin(), text.end());
}

std::vector<uint8_t> Seal(const LeechPinKey& key, base::span<const uint8_t> plain, base::span<const uint8_t> data) {
  crypto::Aead aead(crypto::Aead::AES_256_GCM);
  aead.Init(key);
  std::vector<uint8_t> sealed = crypto::RandBytesAsVector(kNonceLength);
  const std::vector<uint8_t> cipher = aead.Seal(plain, sealed, data);
  sealed.insert(sealed.end(), cipher.begin(), cipher.end());
  return sealed;
}

std::optional<std::vector<uint8_t>> Open(const LeechPinKey& key, base::span<const uint8_t> sealed,
                                         base::span<const uint8_t> data) {
  if (sealed.size() <= kNonceLength) {
    return std::nullopt;
  }
  crypto::Aead aead(crypto::Aead::AES_256_GCM);
  aead.Init(key);
  return aead.Open(sealed.subspan(kNonceLength), sealed.first(kNonceLength), data);
}

std::vector<uint8_t> KeyData(const LeechPasskey& passkey) {
  std::vector<uint8_t> data = passkey.credential_id;
  data.insert(data.end(), passkey.rp_id.begin(), passkey.rp_id.end());
  return data;
}

std::optional<LeechPasskey> PasskeyFrom(const base::DictValue& dict) {
  const std::string* id = dict.FindString("id");
  const std::string* rp = dict.FindString("rp");
  const std::string* user_id = dict.FindString("userId");
  const std::string* key = dict.FindString("key");
  if (!id || !rp || !user_id || !key) {
    return std::nullopt;
  }
  LeechPasskey passkey;
  auto credential_id = base::Base64Decode(*id);
  auto user = base::Base64Decode(*user_id);
  auto sealed = base::Base64Decode(*key);
  if (!credential_id || !user || !sealed) {
    return std::nullopt;
  }
  passkey.credential_id = std::move(*credential_id);
  passkey.rp_id = *rp;
  passkey.user_id = std::move(*user);
  passkey.sealed_key = std::move(*sealed);
  const std::string* name = dict.FindString("user");
  const std::string* display = dict.FindString("displayName");
  passkey.user_name = name ? *name : std::string();
  passkey.display_name = display ? *display : std::string();
  passkey.created = dict.FindDouble("created").value_or(0);
  return passkey;
}

}  // namespace

LeechPasskey::LeechPasskey() = default;
LeechPasskey::LeechPasskey(const LeechPasskey&) = default;
LeechPasskey& LeechPasskey::operator=(const LeechPasskey&) = default;
LeechPasskey::~LeechPasskey() = default;

LeechPasskeyVault::LeechPasskeyVault() = default;
LeechPasskeyVault::LeechPasskeyVault(const LeechPasskeyVault&) = default;
LeechPasskeyVault& LeechPasskeyVault::operator=(const LeechPasskeyVault&) = default;
LeechPasskeyVault::~LeechPasskeyVault() = default;

std::optional<LeechPasskeyVault> ParseVault(std::string_view json) {
  std::optional<base::DictValue> dict = base::JSONReader::ReadDict(json, base::JSON_PARSE_RFC);
  if (!dict || dict->FindInt("version") != 1) {
    return std::nullopt;
  }
  LeechPasskeyVault vault;
  const std::string* salt = dict->FindString("salt");
  const std::string* check = dict->FindString("check");
  if (salt && check) {
    auto salt_bytes = base::Base64Decode(*salt);
    auto check_bytes = base::Base64Decode(*check);
    if (!salt_bytes || !check_bytes) {
      return std::nullopt;
    }
    vault.salt = std::move(*salt_bytes);
    vault.check = std::move(*check_bytes);
  }
  if (const base::ListValue* list = dict->FindList("passkeys")) {
    for (const base::Value& entry : *list) {
      std::optional<LeechPasskey> passkey = entry.is_dict() ? PasskeyFrom(entry.GetDict()) : std::nullopt;
      if (!passkey) {
        return std::nullopt;
      }
      vault.passkeys.push_back(std::move(*passkey));
    }
  }
  return vault;
}

std::string SerializeVault(const LeechPasskeyVault& vault) {
  base::ListValue list;
  for (const LeechPasskey& passkey : vault.passkeys) {
    list.Append(base::DictValue()
                    .Set("id", base::Base64Encode(passkey.credential_id))
                    .Set("rp", passkey.rp_id)
                    .Set("userId", base::Base64Encode(passkey.user_id))
                    .Set("user", passkey.user_name)
                    .Set("displayName", passkey.display_name)
                    .Set("created", passkey.created)
                    .Set("key", base::Base64Encode(passkey.sealed_key)));
  }
  base::DictValue dict;
  dict.Set("version", 1);
  if (vault.set_up()) {
    dict.Set("salt", base::Base64Encode(vault.salt));
    dict.Set("check", base::Base64Encode(vault.check));
  }
  dict.Set("passkeys", std::move(list));
  return base::WriteJsonWithOptions(dict, base::JSONWriter::OPTIONS_PRETTY_PRINT).value_or(std::string());
}

LeechPinKey KeyFromPin(std::string_view pin, base::span<const uint8_t> salt) {
  LeechPinKey key{};
  if (!EVP_PBE_scrypt(pin.data(), pin.size(), salt.data(), salt.size(), kScryptN, kScryptR, kScryptP,
                      kScryptMaxMemory, key.data(), key.size())) {
    // Only an allocation failure gets here (the parameters are fixed and valid); a zero key opens nothing.
    LOG(ERROR) << "Leech passkeys: scrypt failed";
  }
  return key;
}

LeechPasskeyVault NewVault(std::string_view pin) {
  LeechPasskeyVault vault;
  vault.salt = crypto::RandBytesAsVector(kSaltLength);
  const LeechPinKey key = KeyFromPin(pin, vault.salt);
  vault.check = Seal(key, Bytes(kCheckText), Bytes(kCheckData));
  return vault;
}

std::optional<LeechPinKey> UnlockVault(const LeechPasskeyVault& vault, std::string_view pin) {
  if (!vault.set_up()) {
    return std::nullopt;
  }
  const LeechPinKey key = KeyFromPin(pin, vault.salt);
  std::optional<std::vector<uint8_t>> text = Open(key, vault.check, Bytes(kCheckData));
  if (!text || !crypto::SecureMemEqual(*text, Bytes(kCheckText))) {
    return std::nullopt;
  }
  return key;
}

std::vector<uint8_t> SealKey(const LeechPinKey& key, const LeechPasskey& passkey, base::span<const uint8_t> pkcs8) {
  return Seal(key, pkcs8, KeyData(passkey));
}

std::optional<std::vector<uint8_t>> OpenKey(const LeechPinKey& key, const LeechPasskey& passkey) {
  return Open(key, passkey.sealed_key, KeyData(passkey));
}

std::optional<LeechPasskeyVault> ChangePin(const LeechPasskeyVault& vault, std::string_view old_pin,
                                           std::string_view new_pin) {
  std::optional<LeechPinKey> old_key = UnlockVault(vault, old_pin);
  if (!old_key) {
    return std::nullopt;
  }
  LeechPasskeyVault changed = NewVault(new_pin);
  const LeechPinKey new_key = KeyFromPin(new_pin, changed.salt);
  for (LeechPasskey passkey : vault.passkeys) {
    std::optional<std::vector<uint8_t>> pkcs8 = OpenKey(*old_key, passkey);
    if (!pkcs8) {
      // A key the right PIN can't open was damaged on disk; changing the PIN must not drop it silently.
      LOG(ERROR) << "Leech passkeys: a key for " << passkey.rp_id << " doesn't open; the PIN stays as it was";
      return std::nullopt;
    }
    passkey.sealed_key = SealKey(new_key, passkey, *pkcs8);
    crypto::SecureZeroBuffer(*pkcs8);
    changed.passkeys.push_back(std::move(passkey));
  }
  return changed;
}
