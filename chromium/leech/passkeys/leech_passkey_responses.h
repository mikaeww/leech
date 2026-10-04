// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_PASSKEYS_LEECH_PASSKEY_RESPONSES_H_
#define CHROME_BROWSER_UI_LEECH_PASSKEYS_LEECH_PASSKEY_RESPONSES_H_

#include <string>
#include <string_view>

#include "base/containers/span.h"
#include "crypto/keypair.h"
#include "third_party/blink/public/mojom/webauthn/authenticator.mojom.h"

struct LeechPasskey;

namespace url {
class Origin;
}

// What a site gets back from a Leech passkey: client data, authenticator data, the attestation object (format
// "none") and the ES256 signature, as WebAuthn Level 3 lays them out. No state, no PIN: the caller has the key.

// `type` is "webauthn.create" or "webauthn.get". Members in the order the spec serializes them.
std::string ClientDataJson(std::string_view type, base::span<const uint8_t> challenge, const url::Origin& origin);

blink::mojom::MakeCredentialAuthenticatorResponsePtr MakeCredentialResponse(const LeechPasskey& passkey,
                                                                            const crypto::keypair::PrivateKey& key,
                                                                            std::string client_data_json,
                                                                            bool cred_props);

blink::mojom::GetAssertionAuthenticatorResponsePtr AssertionResponse(const LeechPasskey& passkey,
                                                                     const crypto::keypair::PrivateKey& key,
                                                                     std::string client_data_json);

#endif  // CHROME_BROWSER_UI_LEECH_PASSKEYS_LEECH_PASSKEY_RESPONSES_H_
