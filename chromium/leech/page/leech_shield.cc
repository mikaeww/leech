// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/page/leech_shield.h"

#include <utility>
#include <vector>

#include "base/logging.h"
#include "chrome/browser/extensions/component_loader.h"
#include "chrome/browser/profiles/profile.h"
#include "extensions/browser/api/declarative_net_request/rules_monitor_service.h"
#include "extensions/browser/extension_registry.h"
#include "extensions/common/api/declarative_net_request.h"

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

}  // namespace

void LeechShield(Profile* profile, const base::Value& config) {
  const base::DictValue* dict = config.GetIfDict();
  if (!dict || profile->IsOffTheRecord()) {
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
