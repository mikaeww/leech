// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_DEV_LEECH_DEV_H_
#define CHROME_BROWSER_UI_LEECH_DEV_LEECH_DEV_H_

#include <string>

#include "base/functional/callback.h"
#include "base/memory/scoped_refptr.h"
#include "base/values.h"
#include "content/public/browser/devtools_agent_host_client.h"

namespace content {
class DevToolsAgentHost;
class WebContents;
}  // namespace content

// The Dev UI's way into the browser: the DevTools protocol on the tab on screen, which the UI's Console,
// Network, Elements, Storage and Security speak. Not for: the tools themselves, which are JS in ui/dev/.
class LeechDev : public content::DevToolsAgentHostClient {
 public:
  using Emit = base::RepeatingCallback<void(const std::string& name, base::ListValue args)>;
  using Reply = base::OnceCallback<void(base::Value)>;

  explicit LeechDev(Emit emit);
  ~LeechDev() override;

  // A "dev-*" call: attach (to `tab`), detach, cdp (a protocol message as JSON). Protocol messages come back
  // as "cdp" events, a closed tab as "cdp-closed".
  void Call(const std::string& method, content::WebContents* tab, const base::ListValue& args, Reply reply);

  // content::DevToolsAgentHostClient:
  void DispatchProtocolMessage(content::DevToolsAgentHost* host, base::span<const uint8_t> message) override;
  void AgentHostClosed(content::DevToolsAgentHost* host) override;
  bool MayAttachToURL(const GURL& url, bool is_webui) override;
  bool MayReadLocalFiles() override;
  bool MayWriteLocalFiles() override;

 private:
  bool Attach(content::WebContents* tab);
  void Detach();

  Emit emit_;
  scoped_refptr<content::DevToolsAgentHost> host_;
};

#endif  // CHROME_BROWSER_UI_LEECH_DEV_LEECH_DEV_H_
