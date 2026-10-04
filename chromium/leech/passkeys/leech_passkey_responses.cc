// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/passkeys/leech_passkey_responses.h"

#include <array>
#include <memory>
#include <utility>
#include <vector>

#include "base/base64url.h"
#include "base/json/string_escape.h"
#include "chrome/browser/ui/leech/passkeys/leech_passkey_store.h"
#include "components/cbor/writer.h"
#include "crypto/hash.h"
#include "crypto/sign.h"
#include "device/fido/attestation_object.h"
#include "device/fido/attestation_statement.h"
#include "device/fido/attested_credential_data.h"
#include "device/fido/authenticator_data.h"
#include "device/fido/public/fido_constants.h"
#include "device/fido/public/fido_transport_protocol.h"
#include "device/fido/public/fido_types.h"
#include "device/fido/public_key.h"
#include "url/origin.h"

namespace {

// Leech's AAGUID, so a site's list of passkeys can say where one lives: 05988eb8-72ec-48cf-a483-c2a3dbf24cc3.
constexpr std::array<uint8_t, device::kAaguidLength> kAaguid = {
    0x05, 0x98, 0x8e, 0xb8, 0x72, 0xec, 0x48, 0xcf, 0xa4, 0x83, 0xc2, 0xa3, 0xdb, 0xf2, 0x4c, 0xc3};
constexpr int32_t kEs256 = static_cast<int32_t>(device::CoseAlgorithmIdentifier::kEs256);

std::string Base64Url(base::span<const uint8_t> bytes) {
  std::string text;
  base::Base64UrlEncode(bytes, base::Base64UrlEncodePolicy::OMIT_PADDING, &text);
  return text;
}

std::vector<uint8_t> Bytes(std::string_view text) {
  return std::vector<uint8_t>(text.begin(), text.end());
}

// User present and verified (the PIN), not backed up and never to be (ADR 0009), sign count 0.
device::AuthenticatorData AuthData(const LeechPasskey& passkey,
                                   std::optional<device::AttestedCredentialData> attested) {
  return device::AuthenticatorData(crypto::hash::Sha256(passkey.rp_id), /*user_present=*/true,
                                   /*user_verified=*/true, /*backup_eligible=*/false, /*backup_state=*/false,
                                   /*sign_counter=*/0, std::move(attested), std::nullopt);
}

blink::mojom::CommonCredentialInfoPtr Info(const LeechPasskey& passkey, std::string client_data_json,
                                           std::vector<uint8_t> authenticator_data) {
  auto info = blink::mojom::CommonCredentialInfo::New();
  info->id = Base64Url(passkey.credential_id);
  info->raw_id = passkey.credential_id;
  info->client_data_json = Bytes(client_data_json);
  info->authenticator_data = std::move(authenticator_data);
  return info;
}

}  // namespace

std::string ClientDataJson(std::string_view type, base::span<const uint8_t> challenge, const url::Origin& origin) {
  std::string json = "{\"type\":";
  base::EscapeJSONString(type, true, &json);
  json += ",\"challenge\":";
  base::EscapeJSONString(Base64Url(challenge), true, &json);
  json += ",\"origin\":";
  base::EscapeJSONString(origin.Serialize(), true, &json);
  // Requests from cross-origin frames never get here (ADR 0009).
  json += ",\"crossOrigin\":false}";
  return json;
}

blink::mojom::MakeCredentialAuthenticatorResponsePtr MakeCredentialResponse(const LeechPasskey& passkey,
                                                                            const crypto::keypair::PrivateKey& key,
                                                                            std::string client_data_json,
                                                                            bool cred_props) {
  const std::vector<uint8_t> spki = key.ToSubjectPublicKeyInfo();
  device::AttestedCredentialData attested(kAaguid, passkey.credential_id,
                                          device::PublicKey::FromSpkiDer(kEs256, spki));
  device::AuthenticatorData auth_data = AuthData(passkey, std::move(attested));
  std::vector<uint8_t> auth_bytes = auth_data.SerializeToByteArray();
  device::AttestationObject attestation(std::move(auth_data), std::make_unique<device::NoneAttestationStatement>());

  auto response = blink::mojom::MakeCredentialAuthenticatorResponse::New();
  response->info = Info(passkey, std::move(client_data_json), std::move(auth_bytes));
  response->authenticator_attachment = device::AuthenticatorAttachment::kPlatform;
  response->attestation_object = cbor::Writer::Write(device::AsCBOR(attestation)).value_or(std::vector<uint8_t>());
  response->transports = {device::FidoTransportProtocol::kInternal};
  response->public_key_der = spki;
  response->public_key_algo = kEs256;
  // Every Leech passkey is discoverable: it keeps the user's name and handle.
  response->echo_cred_props = cred_props;
  response->has_cred_props_rk = cred_props;
  response->cred_props_rk = cred_props;
  return response;
}

blink::mojom::GetAssertionAuthenticatorResponsePtr AssertionResponse(const LeechPasskey& passkey,
                                                                     const crypto::keypair::PrivateKey& key,
                                                                     std::string client_data_json) {
  std::vector<uint8_t> auth_bytes = AuthData(passkey, std::nullopt).SerializeToByteArray();
  std::vector<uint8_t> signed_data = auth_bytes;
  const auto client_hash = crypto::hash::Sha256(client_data_json);
  signed_data.insert(signed_data.end(), client_hash.begin(), client_hash.end());

  auto response = blink::mojom::GetAssertionAuthenticatorResponse::New();
  response->info = Info(passkey, std::move(client_data_json), std::move(auth_bytes));
  response->authenticator_attachment = device::AuthenticatorAttachment::kPlatform;
  response->signature = crypto::sign::Sign(crypto::sign::ECDSA_SHA256, key, signed_data);
  response->user_handle = passkey.user_id;
  response->extensions = blink::mojom::AuthenticationExtensionsClientOutputs::New();
  return response;
}
