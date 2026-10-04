// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/passkeys/leech_passkey_bridge.h"

#include <algorithm>
#include <utility>

#include "base/functional/bind.h"

namespace {

// chrome.send gives whole numbers as int when they fit, as double otherwise.
int NumberOf(const base::Value* value) {
  if (value && value->is_int()) {
    return value->GetInt();
  }
  return value && value->is_double() ? static_cast<int>(value->GetDouble()) : -1;
}

LeechPasskeyProxy::Done Said(LeechPasskeyBridge::Reply reply) {
  return base::BindOnce([](LeechPasskeyBridge::Reply reply, std::string outcome) {
    std::move(reply).Run(base::Value(std::move(outcome)));
  }, std::move(reply));
}

}  // namespace

LeechPasskeyBridge::LeechPasskeyBridge(content::BrowserContext* context, Emit emit,
                                       base::RepeatingCallback<bool()> focused)
    : proxy_(LeechPasskeyProxy::For(context)), emit_(std::move(emit)), focused_(std::move(focused)) {
  if (proxy_) {
    proxy_->AddPrompter(this);
  }
}

LeechPasskeyBridge::~LeechPasskeyBridge() {
  if (proxy_) {
    proxy_->RemovePrompter(this);
  }
}

void LeechPasskeyBridge::SetOn(bool on) {
  if (proxy_) {
    proxy_->SetOn(on);
  }
}

void LeechPasskeyBridge::Handle(const std::string& method, const base::ListValue& args, Reply reply) {
  auto arg = [&](size_t i) -> const base::Value* { return i + 2 < args.size() ? &args[i + 2] : nullptr; };
  auto text = [&](size_t i) { return arg(i) && arg(i)->is_string() ? arg(i)->GetString() : std::string(); };
  if (!proxy_) {
    return std::move(reply).Run(base::Value());
  }
  if (method == "passkey-answer") {
    proxy_->Answer(NumberOf(arg(0)), text(1), std::max(0, NumberOf(arg(2))), Said(std::move(reply)));
  } else if (method == "passkey-decline") {
    proxy_->Decline(NumberOf(arg(0)), arg(1) && arg(1)->GetIfBool().value_or(false));
    std::move(reply).Run(base::Value());
  } else if (method == "passkeys-setup") {
    proxy_->SetUp(text(0), Said(std::move(reply)));
  } else if (method == "passkeys-pin") {
    proxy_->ChangePin(text(0), text(1), Said(std::move(reply)));
  } else {
    if (method == "passkeys-remove") {
      proxy_->Remove(text(0));
    } else if (method == "passkeys-reset") {
      proxy_->Reset();
    }
    std::move(reply).Run(base::Value(proxy_->Summary()));
  }
}

bool LeechPasskeyBridge::HasFocus() const {
  return focused_.Run();
}

void LeechPasskeyBridge::ShowPasskeyRequest(base::DictValue request) {
  emit_.Run("passkey", base::ListValue().Append(std::move(request)));
}

void LeechPasskeyBridge::ClosePasskeyRequest(int id, const std::string& note) {
  emit_.Run("passkey-close", base::ListValue().Append(id).Append(note));
}
