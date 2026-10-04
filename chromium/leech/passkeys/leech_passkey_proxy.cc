// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/passkeys/leech_passkey_proxy.h"

#include <algorithm>
#include <memory>
#include <utility>

#include "base/base64url.h"
#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/task/thread_pool.h"
#include "chrome/browser/ui/leech/passkeys/leech_passkey_responses.h"
#include "content/public/browser/browser_context.h"
#include "crypto/keypair.h"
#include "crypto/random.h"
#include "crypto/secure_util.h"
#include "device/fido/public/fido_constants.h"
#include "device/fido/public/fido_types.h"

namespace {

const char kUserDataKey[] = "LeechPasskeyProxy";
// The person said "Phone or key…", or Leech had nothing to offer: this origin's next request goes to Chromium.
constexpr base::TimeDelta kStepAside = base::Minutes(1);
// ADR 0009: at least six characters, letters allowed.
constexpr size_t kShortestPin = 6;
constexpr size_t kCredentialIdLength = 32;

std::string Base64Url(base::span<const uint8_t> bytes) {
  std::string text;
  base::Base64UrlEncode(bytes, base::Base64UrlEncodePolicy::OMIT_PADDING, &text);
  return text;
}

std::string NameOf(const LeechPasskey& passkey) {
  return passkey.user_name.empty() ? passkey.display_name : passkey.user_name;
}

blink::mojom::WebAuthnDOMExceptionDetailsPtr Exception(const std::string& name, const std::string& message) {
  return blink::mojom::WebAuthnDOMExceptionDetails::New(name, message);
}

// What the worker makes of a create answer. `fresh` is the vault a first passkey sets up.
struct Made {
  bool wrong_pin = false;
  std::optional<LeechPasskeyVault> fresh;
  LeechPasskey passkey;
  blink::mojom::MakeCredentialAuthenticatorResponsePtr response;
};

Made MakePasskey(LeechPasskeyVault lock, LeechPasskey draft, std::vector<uint8_t> challenge, url::Origin origin,
                 bool cred_props, std::string pin) {
  Made made;
  if (!lock.set_up()) {
    made.fresh = NewVault(pin);
    lock = *made.fresh;
  }
  std::optional<LeechPinKey> key = UnlockVault(lock, pin);
  if (!key) {
    made.wrong_pin = true;
    return made;
  }
  crypto::keypair::PrivateKey private_key = crypto::keypair::PrivateKey::GenerateEcP256();
  draft.credential_id = crypto::RandBytesAsVector(kCredentialIdLength);
  draft.created = base::Time::Now().InMillisecondsFSinceUnixEpoch();
  std::vector<uint8_t> pkcs8 = private_key.ToPrivateKeyInfo();
  draft.sealed_key = SealKey(*key, draft, pkcs8);
  crypto::SecureZeroBuffer(pkcs8);
  made.response =
      MakeCredentialResponse(draft, private_key, ClientDataJson("webauthn.create", challenge, origin), cred_props);
  made.passkey = std::move(draft);
  return made;
}

// nullptr with `wrong_pin` false: the right PIN didn't open the key, which was damaged on disk.
struct Signed {
  bool wrong_pin = false;
  blink::mojom::GetAssertionAuthenticatorResponsePtr response;
};

Signed SignIn(LeechPasskeyVault lock, LeechPasskey passkey, std::vector<uint8_t> challenge, url::Origin origin,
              std::string pin) {
  Signed result;
  std::optional<LeechPinKey> key = UnlockVault(lock, pin);
  if (!key) {
    result.wrong_pin = true;
    return result;
  }
  std::optional<std::vector<uint8_t>> pkcs8 = OpenKey(*key, passkey);
  std::optional<crypto::keypair::PrivateKey> private_key =
      pkcs8 ? crypto::keypair::PrivateKey::FromPrivateKeyInfo(*pkcs8) : std::nullopt;
  if (pkcs8) {
    crypto::SecureZeroBuffer(*pkcs8);
  }
  if (!private_key) {
    LOG(ERROR) << "Leech passkeys: the key for " << passkey.rp_id << " doesn't open with the right PIN";
    return result;
  }
  result.response = AssertionResponse(passkey, *private_key, ClientDataJson("webauthn.get", challenge, origin));
  return result;
}

// nullopt: no file yet. A file that is there but unreadable is moved aside, never overwritten.
std::optional<std::string> ReadVaultFile(base::FilePath file) {
  std::string json;
  if (!base::ReadFileToString(file, &json)) {
    return std::nullopt;
  }
  if (!ParseVault(json)) {
    const base::FilePath aside = file.AddExtensionASCII("unreadable");
    LOG(ERROR) << "Leech passkeys: " << file << " isn't a passkey file; moved to " << aside;
    base::Move(file, aside);
    return std::nullopt;
  }
  return json;
}

}  // namespace

LeechPasskeyProxy::Pending::Pending() = default;
LeechPasskeyProxy::Pending::Pending(Pending&&) = default;
LeechPasskeyProxy::Pending& LeechPasskeyProxy::Pending::operator=(Pending&&) = default;
LeechPasskeyProxy::Pending::~Pending() = default;

// static
LeechPasskeyProxy* LeechPasskeyProxy::For(content::BrowserContext* context) {
  if (context->IsOffTheRecord()) {
    return nullptr;
  }
  auto* proxy = static_cast<LeechPasskeyProxy*>(context->GetUserData(kUserDataKey));
  if (!proxy) {
    auto made = std::make_unique<LeechPasskeyProxy>(context->GetPath().AppendASCII("Leech Passkeys.json"));
    proxy = made.get();
    context->SetUserData(kUserDataKey, std::move(made));
  }
  return proxy;
}

// static
content::WebAuthenticationRequestProxy* LeechPasskeyProxy::IfActive(content::BrowserContext* context,
                                                                    const url::Origin& origin) {
  auto* proxy = static_cast<LeechPasskeyProxy*>(context->GetUserData(kUserDataKey));
  return proxy && proxy->IsActive(origin) ? proxy : nullptr;
}

LeechPasskeyProxy::LeechPasskeyProxy(base::FilePath file)
    : file_(std::move(file)),
      writer_(base::ThreadPool::CreateSequencedTaskRunner(
          {base::MayBlock(), base::TaskShutdownBehavior::BLOCK_SHUTDOWN})) {
  // Read on the writer's sequence, so a write never overtakes the read.
  writer_->PostTaskAndReplyWithResult(FROM_HERE, base::BindOnce(&ReadVaultFile, file_),
                                      base::BindOnce(&LeechPasskeyProxy::Loaded, weak_factory_.GetWeakPtr()));
}

LeechPasskeyProxy::~LeechPasskeyProxy() = default;

void LeechPasskeyProxy::Loaded(std::optional<std::string> json) {
  if (std::optional<LeechPasskeyVault> vault = json ? ParseVault(*json) : std::nullopt) {
    vault_ = std::move(*vault);
  }
  loaded_ = true;
}

void LeechPasskeyProxy::Save() {
  writer_->PostTask(FROM_HERE, base::BindOnce(
                                   [](base::FilePath file, std::string json) {
                                     if (!base::ImportantFileWriter::WriteFileAtomically(file, json)) {
                                       LOG(ERROR) << "Leech passkeys: couldn't write " << file;
                                     }
                                   },
                                   file_, SerializeVault(vault_)));
}

void LeechPasskeyProxy::AddPrompter(LeechPasskeyPrompter* prompter) {
  prompters_.push_back(prompter);
}

void LeechPasskeyProxy::RemovePrompter(LeechPasskeyPrompter* prompter) {
  std::erase(prompters_, prompter);
}

void LeechPasskeyProxy::SetOn(bool on) {
  on_ = on;
}

// The focused window's sheet: the request came from a page the person is looking at.
LeechPasskeyPrompter* LeechPasskeyProxy::Prompter() const {
  for (LeechPasskeyPrompter* prompter : prompters_) {
    if (prompter->HasFocus()) {
      return prompter;
    }
  }
  return prompters_.empty() ? nullptr : prompters_.front().get();
}

void LeechPasskeyProxy::StepAside(const url::Origin& origin) {
  stepped_aside_[origin] = base::TimeTicks::Now() + kStepAside;
}

bool LeechPasskeyProxy::IsActive(const url::Origin& caller_origin) {
  // Time decides, not a count: Chromium asks this for isConditionalMediationAvailable() too, before the retry.
  auto aside = stepped_aside_.find(caller_origin);
  if (aside != stepped_aside_.end() && aside->second > base::TimeTicks::Now()) {
    return false;
  }
  return loaded_ && on_ && !prompters_.empty();
}

LeechPasskeyProxy::RequestId LeechPasskeyProxy::Refuse(RequestId id, Pending pending, const std::string& name,
                                                       const std::string& message) {
  auto task = pending.create_done
                  ? base::BindOnce(std::move(pending.create_done), id, Exception(name, message), nullptr)
                  : base::BindOnce(std::move(pending.get_done), id, Exception(name, message), nullptr);
  base::SequencedTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE, std::move(task));
  return id;
}

LeechPasskeyProxy::RequestId LeechPasskeyProxy::SignalCreateRequest(
    const blink::mojom::PublicKeyCredentialCreationOptionsPtr& options,
    CreateCallback callback) {
  const RequestId id = ++next_id_;
  Pending pending;
  pending.create_done = std::move(callback);
  const auto& client = options->remote_desktop_client_override;
  LeechPasskeyPrompter* prompter = Prompter();
  if (!client || !client->same_origin_with_ancestors || !prompter) {
    return Refuse(id, std::move(pending), "NotAllowedError", "Leech's passkeys answer neither embedded frames nor a window without its sheet");
  }
  pending.origin = client->origin;
  const auto& params = options->public_key_parameters;
  if (std::ranges::none_of(params, [](const auto& p) {
        return p.algorithm == static_cast<int32_t>(device::CoseAlgorithmIdentifier::kEs256);
      })) {
    return Refuse(id, std::move(pending), "NotSupportedError", "Leech's passkeys are ES256 only");
  }
  if (options->authenticator_selection &&
      options->authenticator_selection->authenticator_attachment == device::AuthenticatorAttachment::kCrossPlatform) {
    StepAside(pending.origin);
    prompter->ClosePasskeyRequest(id, "This site wants a phone or security key: try again and Chromium will ask");
    return Refuse(id, std::move(pending), "NotAllowedError", "Asks for a cross-platform authenticator");
  }
  const std::string& rp_id = options->relying_party.id;
  for (const LeechPasskey& held : vault_.passkeys) {
    if (held.rp_id == rp_id && std::ranges::any_of(options->exclude_credentials, [&](const auto& excluded) {
          return excluded.id == held.credential_id;
        })) {
      return Refuse(id, std::move(pending), "InvalidStateError", "Leech already holds a passkey for this account");
    }
  }
  pending.challenge = options->challenge;
  pending.cred_props = options->cred_props;
  pending.draft.rp_id = rp_id;
  pending.draft.user_id = options->user.id;
  pending.draft.user_name = options->user.name.value_or(std::string());
  pending.draft.display_name = options->user.display_name.value_or(std::string());
  prompter->ShowPasskeyRequest(base::DictValue()
                                   .Set("id", id)
                                   .Set("kind", "create")
                                   .Set("rp", rp_id)
                                   .Set("user", NameOf(pending.draft))
                                   .Set("setUp", vault_.set_up()));
  pending_[id] = std::move(pending);
  return id;
}

std::vector<LeechPasskey> LeechPasskeyProxy::AccountsFor(
    const blink::mojom::PublicKeyCredentialRequestOptionsPtr& options) const {
  std::vector<LeechPasskey> accounts;
  for (const LeechPasskey& held : vault_.passkeys) {
    const bool allowed = options->allow_credentials.empty() ||
                         std::ranges::any_of(options->allow_credentials,
                                             [&](const auto& allow) { return allow.id == held.credential_id; });
    if (held.rp_id == options->relying_party_id && allowed) {
      accounts.push_back(held);
    }
  }
  return accounts;
}

LeechPasskeyProxy::RequestId LeechPasskeyProxy::SignalGetRequest(
    const blink::mojom::PublicKeyCredentialRequestOptionsPtr& options,
    GetCallback callback) {
  const RequestId id = ++next_id_;
  Pending pending;
  pending.get_done = std::move(callback);
  const auto& client = options->extensions->remote_desktop_client_override;
  LeechPasskeyPrompter* prompter = Prompter();
  if (!client || !client->same_origin_with_ancestors || !prompter) {
    return Refuse(id, std::move(pending), "NotAllowedError", "Leech's passkeys answer neither embedded frames nor a window without its sheet");
  }
  pending.origin = client->origin;
  pending.accounts = AccountsFor(options);
  if (pending.accounts.empty()) {
    StepAside(pending.origin);
    prompter->ClosePasskeyRequest(id, "No passkey in Leech for " + options->relying_party_id +
                                          ": try again to use a phone or security key");
    return Refuse(id, std::move(pending), "NotAllowedError", "Leech holds no passkey this site asked for");
  }
  pending.challenge = options->challenge;
  base::ListValue accounts;
  for (const LeechPasskey& account : pending.accounts) {
    accounts.Append(base::DictValue().Set("user", NameOf(account)).Set("name", account.display_name));
  }
  prompter->ShowPasskeyRequest(base::DictValue()
                                   .Set("id", id)
                                   .Set("kind", "get")
                                   .Set("rp", options->relying_party_id)
                                   .Set("accounts", std::move(accounts))
                                   .Set("setUp", vault_.set_up()));
  pending_[id] = std::move(pending);
  return id;
}

LeechPasskeyProxy::RequestId LeechPasskeyProxy::SignalIsUvpaaRequest(IsUvpaaCallback callback) {
  // Leech asks its PIN on every use: it is a user-verifying platform authenticator.
  base::SequencedTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE, base::BindOnce(std::move(callback), true));
  return ++next_id_;
}

void LeechPasskeyProxy::CancelRequest(RequestId id) {
  if (pending_.erase(id) && Prompter()) {
    Prompter()->ClosePasskeyRequest(id, std::string());
  }
}

void LeechPasskeyProxy::Decline(RequestId id, bool phone_or_key) {
  auto it = pending_.find(id);
  if (it == pending_.end()) {
    return;
  }
  Pending pending = std::move(it->second);
  pending_.erase(it);
  if (phone_or_key) {
    StepAside(pending.origin);
  }
  Refuse(id, std::move(pending), "NotAllowedError", "The person declined");
}

void LeechPasskeyProxy::Answer(RequestId id, const std::string& pin, size_t account, Done done) {
  auto it = pending_.find(id);
  if (it == pending_.end()) {
    return std::move(done).Run("gone");
  }
  if (it->second.create_done) {
    return AnswerCreate(id, pin, std::move(done));
  }
  AnswerGet(id, pin, account, std::move(done));
}

void LeechPasskeyProxy::AnswerCreate(RequestId id, const std::string& pin, Done done) {
  if (!vault_.set_up() && pin.size() < kShortestPin) {
    return std::move(done).Run("short-pin");
  }
  const Pending& pending = pending_[id];
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock()},
      base::BindOnce(&MakePasskey, vault_, pending.draft, pending.challenge, pending.origin, pending.cred_props, pin),
      base::BindOnce(
          [](base::WeakPtr<LeechPasskeyProxy> self, RequestId id, std::vector<uint8_t> salt, Done done, Made made) {
            if (!self || !self->pending_.contains(id)) {
              return std::move(done).Run("gone");
            }
            if (made.wrong_pin) {
              return std::move(done).Run("wrong-pin");
            }
            // The PIN was set or changed in the settings meanwhile: the key is sealed under a PIN no longer kept.
            if (self->vault_.salt != salt) {
              return std::move(done).Run("changed");
            }
            if (made.fresh) {
              self->vault_ = *made.fresh;
            }
            self->vault_.passkeys.push_back(made.passkey);
            self->Save();
            Pending pending = std::move(self->pending_[id]);
            self->pending_.erase(id);
            std::move(pending.create_done).Run(id, nullptr, std::move(made.response));
            std::move(done).Run("ok");
          },
          weak_factory_.GetWeakPtr(), id, vault_.salt, std::move(done)));
}

void LeechPasskeyProxy::AnswerGet(RequestId id, const std::string& pin, size_t account, Done done) {
  const Pending& pending = pending_[id];
  if (account >= pending.accounts.size()) {
    return std::move(done).Run("gone");
  }
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock()},
      base::BindOnce(&SignIn, vault_, pending.accounts[account], pending.challenge, pending.origin, pin),
      base::BindOnce(
          [](base::WeakPtr<LeechPasskeyProxy> self, RequestId id, Done done, Signed signed_in) {
            if (!self || !self->pending_.contains(id)) {
              return std::move(done).Run("gone");
            }
            if (signed_in.wrong_pin) {
              return std::move(done).Run("wrong-pin");
            }
            Pending pending = std::move(self->pending_[id]);
            self->pending_.erase(id);
            if (!signed_in.response) {
              std::move(pending.get_done).Run(id, Exception("NotAllowedError", "The passkey is damaged"), nullptr);
              return std::move(done).Run("damaged");
            }
            std::move(pending.get_done).Run(id, nullptr, std::move(signed_in.response));
            std::move(done).Run("ok");
          },
          weak_factory_.GetWeakPtr(), id, std::move(done)));
}

base::DictValue LeechPasskeyProxy::Summary() const {
  base::ListValue list;
  for (const LeechPasskey& passkey : vault_.passkeys) {
    list.Append(base::DictValue()
                    .Set("id", Base64Url(passkey.credential_id))
                    .Set("rp", passkey.rp_id)
                    .Set("user", NameOf(passkey))
                    .Set("created", passkey.created));
  }
  return base::DictValue().Set("on", on_).Set("setUp", vault_.set_up()).Set("passkeys", std::move(list));
}

void LeechPasskeyProxy::SetUp(const std::string& pin, Done done) {
  if (vault_.set_up()) {
    return std::move(done).Run("changed");
  }
  if (pin.size() < kShortestPin) {
    return std::move(done).Run("short-pin");
  }
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock()}, base::BindOnce([](std::string pin) { return NewVault(pin); }, pin),
      base::BindOnce(
          [](base::WeakPtr<LeechPasskeyProxy> self, Done done, LeechPasskeyVault fresh) {
            if (!self || self->vault_.set_up()) {
              return std::move(done).Run("changed");
            }
            self->vault_ = std::move(fresh);
            self->Save();
            std::move(done).Run("ok");
          },
          weak_factory_.GetWeakPtr(), std::move(done)));
}

void LeechPasskeyProxy::ChangePin(const std::string& old_pin, const std::string& new_pin, Done done) {
  if (new_pin.size() < kShortestPin) {
    return std::move(done).Run("short-pin");
  }
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock()},
      base::BindOnce([](LeechPasskeyVault vault, std::string old_pin,
                        std::string new_pin) { return ::ChangePin(vault, old_pin, new_pin); },
                     vault_, old_pin, new_pin),
      base::BindOnce(
          [](base::WeakPtr<LeechPasskeyProxy> self, std::vector<uint8_t> salt, size_t count, Done done,
             std::optional<LeechPasskeyVault> changed) {
            if (!self) {
              return std::move(done).Run("gone");
            }
            if (!changed) {
              return std::move(done).Run("wrong-pin");
            }
            // A passkey made or removed meanwhile would be lost or come back: ask again.
            if (self->vault_.salt != salt || self->vault_.passkeys.size() != count) {
              return std::move(done).Run("changed");
            }
            self->vault_ = std::move(*changed);
            self->Save();
            std::move(done).Run("ok");
          },
          weak_factory_.GetWeakPtr(), vault_.salt, vault_.passkeys.size(), std::move(done)));
}

void LeechPasskeyProxy::Remove(const std::string& id) {
  std::erase_if(vault_.passkeys, [&](const LeechPasskey& passkey) { return Base64Url(passkey.credential_id) == id; });
  Save();
}

void LeechPasskeyProxy::Reset() {
  vault_ = LeechPasskeyVault();
  Save();
}
