// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/page/leech_shield.h"

#include <algorithm>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "base/logging.h"
#include "base/no_destructor.h"
#include "chrome/browser/extensions/component_loader.h"
#include "chrome/browser/profiles/profile.h"
#include "content/public/browser/global_routing_id.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/navigation_throttle.h"
#include "content/public/browser/navigation_throttle_registry.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "extensions/browser/api/declarative_net_request/rules_monitor_service.h"
#include "extensions/browser/extension_registry.h"
#include "extensions/common/api/declarative_net_request.h"
#include "net/base/registry_controlled_domains/registry_controlled_domain.h"
#include "url/gurl.h"

namespace {

namespace dnr = extensions::api::declarative_net_request;

// The key fixes the extension's id, so Chromium keeps its rules under the same name across starts.
constexpr char kManifest[] = R"({
  "manifest_version": 3,
  "name": "Leech shield",
  "version": "1",
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkDolDEvwq4M/QZlFgm7wBxm/zouVHPRR6YMp2kxP8ZuCJwlAcXERZWoJvjQYhCBZy9R11pKa0jUhABY7S/A/zTmuo7qhnqjKkGpyegNGP0Ah+/+nACr586mnrTVblRopFAgRJWif4BOQQtP36zFByFiKby0hBL7RBzS45cu+vVsS4Y9uAK6rDjXUDmkBD3rKi6++lwE2c46BLGEshYYrnEdoet/03+WTyx7dRmMrrvS/InlpzPY6BG2j6MUMNAmX0X2nkctpfV4wAy7fXp3UUV3zXDCyYY0BrEpJaEpEapG5NH7CmHsdWz1yLD3evMXDsNH9yo/HhS/CNYcrGA80MQIDAQAB",
  "permissions": ["declarativeNetRequest"]
})";

constexpr int kBlockRule = 1;
constexpr int kPauseRule = 2;

base::ListValue Strings(const base::DictValue& config, const char* key) {
  base::ListValue out;
  if (const base::ListValue* list = config.FindList(key)) {
    for (const base::Value& item : *list) {
      if (item.is_string() && !item.GetString().empty()) out.Append(item.GetString());
    }
  }
  return out;
}

void AddRule(std::vector<dnr::Rule>& rules, base::DictValue rule) {
  auto parsed = dnr::Rule::FromValue(rule);
  if (!parsed.has_value()) {
    LOG(ERROR) << "Leech shield: a rule Chromium refuses: " << parsed.error();
    return;
  }
  rules.push_back(std::move(parsed.value()));
}

// The rules for a config: none with the shield off; a pause outranks the block.
std::vector<dnr::Rule> RulesFor(const base::DictValue& config) {
  std::vector<dnr::Rule> rules;
  base::ListValue blocked = Strings(config, "blocked");
  if (!config.FindBool("shield").value_or(false) || blocked.empty()) {
    return rules;
  }
  AddRule(rules, base::DictValue()
                     .Set("id", kBlockRule)
                     .Set("priority", 1)
                     .Set("action", base::DictValue().Set("type", "block"))
                     .Set("condition", base::DictValue()
                                           .Set("requestDomains", std::move(blocked))
                                           .Set("domainType", "thirdParty")));
  base::ListValue paused = Strings(config, "paused");
  if (!paused.empty()) {
    AddRule(rules, base::DictValue()
                       .Set("id", kPauseRule)
                       .Set("priority", 2)
                       .Set("action", base::DictValue().Set("type", "allowAllRequests"))
                       .Set("condition", base::DictValue()
                                             .Set("requestDomains", std::move(paused))
                                             .Set("resourceTypes", base::ListValue().Append("main_frame").Append("sub_frame"))));
  }
  return rules;
}

// The guarded sites the shield holds right now: none with it off, none that are paused. One list for every
// profile, as the UI's prefs are.
std::vector<std::string>& Guarded() {
  static base::NoDestructor<std::vector<std::string>> sites;
  return *sites;
}

// Every open tab's watch, told each time the guard keeps a page from leaving (leech_tab_watch.cc).
base::RepeatingCallbackList<void(content::WebContents*, const GURL&)>& Listeners() {
  static base::NoDestructor<base::RepeatingCallbackList<void(content::WebContents*, const GURL&)>> list;
  return *list;
}

void Guard(const base::DictValue& config) {
  Guarded().clear();
  if (!config.FindBool("shield").value_or(false)) {
    return;
  }
  base::ListValue paused = Strings(config, "paused");
  for (const base::Value& site : Strings(config, "guarded")) {
    if (!std::ranges::contains(paused, site)) Guarded().push_back(site.GetString());
  }
}

// A page's own navigation of its tab, or of the tab it opened (from any of its frames): the frame that started it
// tells which tab's site decides.
class GuardThrottle : public content::NavigationThrottle {
 public:
  using content::NavigationThrottle::NavigationThrottle;

  ThrottleCheckResult WillStartRequest() override {
    content::NavigationHandle* handle = navigation_handle();
    if (!handle->IsRendererInitiated() || !handle->GetInitiatorFrameToken()) {
      return PROCEED;
    }
    content::RenderFrameHost* initiator = content::RenderFrameHost::FromFrameToken(
        content::GlobalRenderFrameHostToken(handle->GetInitiatorProcessId(), *handle->GetInitiatorFrameToken()));
    return initiator && LeechGuards(initiator, handle->GetURL()) ? CANCEL_AND_IGNORE : PROCEED;
  }

  const char* GetNameForLogging() override { return "LeechGuardThrottle"; }
};

}  // namespace

bool LeechGuards(content::RenderFrameHost* initiator, const GURL& target) {
  const GURL& top = initiator->GetOutermostMainFrame()->GetLastCommittedURL();
  const bool guarded = std::ranges::any_of(Guarded(), [&](const std::string& site) { return top.DomainIs(site); });
  if (!guarded ||
      net::registry_controlled_domains::SameDomainOrHost(top, target, net::registry_controlled_domains::INCLUDE_PRIVATE_REGISTRIES)) {
    return false;
  }
  Listeners().Notify(content::WebContents::FromRenderFrameHost(initiator), target);
  return true;
}

base::CallbackListSubscription LeechOnGuarded(base::RepeatingCallback<void(content::WebContents*, const GURL&)> heard) {
  return Listeners().Add(std::move(heard));
}

void LeechGuardNavigation(content::NavigationThrottleRegistry& registry) {
  if (!Guarded().empty() && registry.GetNavigationHandle().IsInPrimaryMainFrame()) {
    registry.AddThrottle(std::make_unique<GuardThrottle>(registry));
  }
}

void LeechShield(Profile* profile, const base::Value& config) {
  const base::DictValue* dict = config.GetIfDict();
  if (!dict) {
    return;
  }
  Guard(*dict);
  if (profile->IsOffTheRecord()) {
    return;
  }
  auto* registry = extensions::ExtensionRegistry::Get(profile);
  if (!registry->enabled_extensions().Contains(kLeechShieldId)) {
    extensions::ComponentLoader::Get(profile)->Add(kManifest, profile->GetPath());
  }
  const extensions::Extension* shield = registry->enabled_extensions().GetByID(kLeechShieldId);
  if (!shield) {
    LOG(ERROR) << "Leech shield: its component extension didn't load; nothing is blocked";
    return;
  }
  extensions::declarative_net_request::RulesMonitorService::Get(profile)->UpdateDynamicRules(
      *shield, {kBlockRule, kPauseRule}, RulesFor(*dict),
      base::BindOnce([](std::optional<std::string> error) {
        if (error) LOG(ERROR) << "Leech shield: Chromium refused the rules: " << *error;
      }));
}
