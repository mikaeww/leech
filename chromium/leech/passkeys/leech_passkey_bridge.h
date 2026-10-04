// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_PASSKEYS_LEECH_PASSKEY_BRIDGE_H_
#define CHROME_BROWSER_UI_LEECH_PASSKEYS_LEECH_PASSKEY_BRIDGE_H_

#include <string>

#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/values.h"
#include "chrome/browser/ui/leech/passkeys/leech_passkey_proxy.h"

namespace content {
class BrowserContext;
}

// A Leech window's end of passkeys: the proxy's requests go to this window's sheet as "passkey" and
// "passkey-close" events, and the sheet's and the settings' calls come back through Handle. One per window;
// the requests and the keys are the proxy's.
class LeechPasskeyBridge : public LeechPasskeyPrompter {
 public:
  using Emit = base::RepeatingCallback<void(const std::string& name, base::ListValue args)>;
  using Reply = base::OnceCallback<void(base::Value result)>;

  LeechPasskeyBridge(content::BrowserContext* context, Emit emit, base::RepeatingCallback<bool()> focused);
  ~LeechPasskeyBridge() override;

  // A UI call whose method starts with "passkey"; `args` as sent: [callId, method, ...].
  void Handle(const std::string& method, const base::ListValue& args, Reply reply);
  void SetOn(bool on);

  // LeechPasskeyPrompter:
  bool HasFocus() const override;
  void ShowPasskeyRequest(base::DictValue request) override;
  void ClosePasskeyRequest(int id, const std::string& note) override;

 private:
  // Null in a private window, which keeps no passkeys.
  raw_ptr<LeechPasskeyProxy> proxy_;
  Emit emit_;
  base::RepeatingCallback<bool()> focused_;
};

#endif  // CHROME_BROWSER_UI_LEECH_PASSKEYS_LEECH_PASSKEY_BRIDGE_H_
