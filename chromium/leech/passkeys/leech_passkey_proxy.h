// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_PASSKEYS_LEECH_PASSKEY_PROXY_H_
#define CHROME_BROWSER_UI_LEECH_PASSKEYS_LEECH_PASSKEY_PROXY_H_

#include <map>
#include <optional>
#include <string>
#include <vector>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/supports_user_data.h"
#include "base/task/sequenced_task_runner.h"
#include "base/time/time.h"
#include "base/values.h"
#include "chrome/browser/ui/leech/passkeys/leech_passkey_store.h"
#include "content/public/browser/web_authentication_request_proxy.h"
#include "url/origin.h"

namespace content {
class BrowserContext;
}

// A Leech window's sheet, as the proxy sees it.
class LeechPasskeyPrompter {
 public:
  virtual ~LeechPasskeyPrompter() = default;
  virtual bool HasFocus() const = 0;
  // {id, kind: "create" | "get", rp, user (create), accounts: [{user, name}] (get), setUp}.
  virtual void ShowPasskeyRequest(base::DictValue request) = 0;
  // The request is over without the sheet's answer; `note` is said to the person when not empty.
  virtual void ClosePasskeyRequest(int id, const std::string& note) = 0;
};

// Answers a profile's WebAuthn requests with the passkeys Leech keeps (ADR 0009), asking the PIN through a
// window's sheet. Content has checked the RP ID against the origin before a request gets here. Not the sheet
// itself (ui/passkeys/) nor the file format (leech_passkey_store).
class LeechPasskeyProxy : public content::WebAuthenticationRequestProxy, public base::SupportsUserData::Data {
 public:
  // The sheet's and the settings' outcomes: "ok", "wrong-pin", "short-pin", "changed", "gone".
  using Done = base::OnceCallback<void(std::string outcome)>;

  // A regular profile's proxy, made and loaded on first use; null for an off-the-record one, which keeps none.
  static LeechPasskeyProxy* For(content::BrowserContext* context);
  // For ChromeWebAuthenticationDelegate: this proxy when it answers `origin`, else null.
  static content::WebAuthenticationRequestProxy* IfActive(content::BrowserContext* context,
                                                          const url::Origin& origin);

  explicit LeechPasskeyProxy(base::FilePath file);
  ~LeechPasskeyProxy() override;

  void AddPrompter(LeechPasskeyPrompter* prompter);
  void RemovePrompter(LeechPasskeyPrompter* prompter);
  void SetOn(bool on);

  // The sheet: `account` picks among a sign-in's accounts.
  void Answer(RequestId id, const std::string& pin, size_t account, Done done);
  // "Phone or key…" lets the origin's next request, within a minute, go to Chromium.
  void Decline(RequestId id, bool phone_or_key);

  // The settings: {on, setUp, passkeys: [{id (base64url), rp, user, created}]}.
  base::DictValue Summary() const;
  void SetUp(const std::string& pin, Done done);
  void ChangePin(const std::string& old_pin, const std::string& new_pin, Done done);
  void Remove(const std::string& id);
  // Forgetting the PIN: every passkey goes.
  void Reset();

  // content::WebAuthenticationRequestProxy:
  bool IsActive(const url::Origin& caller_origin) override;
  RequestId SignalCreateRequest(const blink::mojom::PublicKeyCredentialCreationOptionsPtr& options,
                                CreateCallback callback) override;
  RequestId SignalGetRequest(const blink::mojom::PublicKeyCredentialRequestOptionsPtr& options,
                             GetCallback callback) override;
  RequestId SignalIsUvpaaRequest(IsUvpaaCallback callback) override;
  void CancelRequest(RequestId id) override;

 private:
  // A request waiting for the sheet. Create keeps the passkey to be (without its key), get the accounts on offer.
  struct Pending {
    Pending();
    Pending(Pending&&);
    Pending& operator=(Pending&&);
    ~Pending();

    url::Origin origin;
    std::vector<uint8_t> challenge;
    LeechPasskey draft;
    bool cred_props = false;
    std::vector<LeechPasskey> accounts;
    CreateCallback create_done;
    GetCallback get_done;
  };

  void Loaded(std::optional<std::string> json);
  void Save();
  LeechPasskeyPrompter* Prompter() const;
  // Ends a request with a DOMException. Posted: from inside SignalXRequest content isn't ready for an answer.
  RequestId Refuse(RequestId id, Pending pending, const std::string& name, const std::string& message);
  void StepAside(const url::Origin& origin);
  std::vector<LeechPasskey> AccountsFor(const blink::mojom::PublicKeyCredentialRequestOptionsPtr& options) const;
  void AnswerCreate(RequestId id, const std::string& pin, Done done);
  void AnswerGet(RequestId id, const std::string& pin, size_t account, Done done);

  const base::FilePath file_;
  scoped_refptr<base::SequencedTaskRunner> writer_;
  bool loaded_ = false;
  bool on_ = false;
  LeechPasskeyVault vault_;
  std::vector<raw_ptr<LeechPasskeyPrompter>> prompters_;
  std::map<RequestId, Pending> pending_;
  std::map<url::Origin, base::TimeTicks> stepped_aside_;
  RequestId next_id_ = 0;
  base::WeakPtrFactory<LeechPasskeyProxy> weak_factory_{this};
};

#endif  // CHROME_BROWSER_UI_LEECH_PASSKEYS_LEECH_PASSKEY_PROXY_H_
