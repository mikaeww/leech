// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/dev/leech_dev.h"

#include <utility>

#include "base/containers/span.h"
#include "base/strings/string_view_util.h"
#include "content/public/browser/devtools_agent_host.h"
#include "url/gurl.h"

LeechDev::LeechDev(Emit emit) : emit_(std::move(emit)) {}

LeechDev::~LeechDev() {
  Detach();
}

void LeechDev::Call(const std::string& method, content::WebContents* tab, const base::ListValue& args,
                    Reply reply) {
  auto text = [&](size_t i) { return i < args.size() && args[i].is_string() ? args[i].GetString() : std::string(); };
  base::Value result;
  if (method == "dev-attach") {
    result = base::Value(Attach(tab));
  } else if (method == "dev-detach") {
    Detach();
  } else if (method == "dev-cdp") {
    if (host_) host_->DispatchProtocolMessage(this, base::as_byte_span(text(0)));
    result = base::Value(!!host_);
  }
  std::move(reply).Run(std::move(result));
}

bool LeechDev::Attach(content::WebContents* tab) {
  Detach();
  if (!tab) return false;
  scoped_refptr<content::DevToolsAgentHost> host = content::DevToolsAgentHost::GetOrCreateFor(tab);
  if (!host->AttachClient(this)) return false;
  host_ = std::move(host);
  return true;
}

void LeechDev::Detach() {
  if (host_) host_->DetachClient(this);
  host_ = nullptr;
}

void LeechDev::DispatchProtocolMessage(content::DevToolsAgentHost*, base::span<const uint8_t> message) {
  emit_.Run("cdp", base::ListValue().Append(std::string(base::as_string_view(message))));
}

void LeechDev::AgentHostClosed(content::DevToolsAgentHost*) {
  host_ = nullptr;
  emit_.Run("cdp-closed", base::ListValue());
}

// Web pages only: Leech's own chrome:// pages and the browser itself stay out of the Dev UI's reach.
bool LeechDev::MayAttachToURL(const GURL& url, bool is_webui) {
  return !is_webui && !url.SchemeIs("chrome");
}

bool LeechDev::MayReadLocalFiles() {
  return false;
}

bool LeechDev::MayWriteLocalFiles() {
  return false;
}
