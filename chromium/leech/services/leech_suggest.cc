// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/services/leech_suggest.h"

#include <string_view>
#include <utility>

#include "base/containers/fixed_flat_map.h"
#include "base/functional/bind.h"
#include "base/strings/escape.h"
#include "chrome/browser/profiles/profile.h"
#include "content/public/browser/storage_partition.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "url/gurl.h"

namespace {

// Where each engine the UI offers answers suggestions, all in OpenSearch's ["typed", [...]] shape.
// The UI names the engine, never the address: it cannot make the browser fetch anything else.
constexpr auto kSuggestURLs = base::MakeFixedFlatMap<std::string_view, std::string_view>({
    {"google", "https://suggestqueries.google.com/complete/search?client=firefox&q="},
    {"duckduckgo", "https://duckduckgo.com/ac/?type=list&q="},
    {"bing", "https://api.bing.com/osjson.aspx?query="},
    {"ecosia", "https://ac.ecosia.org/autocomplete?type=list&q="},
    {"startpage", "https://www.startpage.com/osuggestions?q="},
    {"kagi", "https://kagi.com/api/autosuggest?q="},
    {"brave", "https://search.brave.com/api/suggest?q="},
});

constexpr net::NetworkTrafficAnnotationTag kAnnotation =
    net::DefineNetworkTrafficAnnotation("leech_search_suggest", R"(
      semantics {
        sender: "Leech address field"
        description: "Asks the chosen search engine for suggestions while the user types."
        trigger: "Typing words that are not an address into the address field."
        data: "The typed text. No cookies."
        destination: OTHER
      }
      policy {
        cookies_allowed: NO
        setting: "None."
        policy_exception_justification: "Not a policy-controlled build."
      })");

}  // namespace

LeechSuggest::LeechSuggest() = default;
LeechSuggest::~LeechSuggest() = default;

void LeechSuggest::Ask(Profile* profile, const std::string& engine, const std::string& typed, Answer done) {
  auto it = kSuggestURLs.find(engine);
  if (it == kSuggestURLs.end() || typed.empty() || typed.size() > 200 || profile->IsOffTheRecord()) {
    loader_.reset();
    return std::move(done).Run(std::nullopt);
  }
  auto request = std::make_unique<network::ResourceRequest>();
  request->url = GURL(std::string(it->second) + base::EscapeQueryParamValue(typed, true));
  // Typed words only: no cookies, so the engine can't tie them to an account.
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  loader_ = network::SimpleURLLoader::Create(std::move(request), kAnnotation);
  loader_->DownloadToString(
      profile->GetDefaultStoragePartition()->GetURLLoaderFactoryForBrowserProcess().get(),
      base::BindOnce(&LeechSuggest::Answered, weak_factory_.GetWeakPtr(), std::move(done)),
      64 * 1024);
}

void LeechSuggest::Answered(Answer done, std::optional<std::string> body) {
  loader_.reset();
  std::move(done).Run(std::move(body));
}
