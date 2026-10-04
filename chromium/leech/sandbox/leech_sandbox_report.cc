// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/sandbox/leech_sandbox_report.h"

#include <algorithm>
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "base/functional/bind.h"
#include "chrome/browser/browsing_data/chrome_browsing_data_model_delegate.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/leech/sandbox/leech_sandbox.h"
#include "components/browsing_data/content/browsing_data_model.h"
#include "content/public/browser/storage_partition.h"
#include "net/cookies/cookie_options.h"
#include "net/cookies/cookie_partition_key_collection.h"
#include "services/network/public/mojom/cookie_manager.mojom.h"
#include "url/gurl.h"

namespace {

using StorageType = BrowsingDataModel::StorageType;

// The words the panel uses for Chromium's storage types.
const char* WordFor(StorageType type) {
  switch (type) {
    case StorageType::kCookie:
      return "cookies";
    case StorageType::kLocalStorage:
      return "local storage";
    case StorageType::kSessionStorage:
      return "session storage";
    case StorageType::kQuotaStorage:
      return "databases and caches";
    case StorageType::kSharedStorage:
      return "shared storage";
    default:
      return "other site data";
  }
}

base::ListValue Sites(const BrowsingDataModel& model) {
  std::map<std::string, base::DictValue> sites;
  for (const BrowsingDataModel::BrowsingDataEntryView& entry : model) {
    const std::string host = BrowsingDataModel::GetHost(*entry.data_owner);
    base::DictValue& site = sites[host];
    site.Set("site", host);
    site.Set("cookies", site.FindDouble("cookies").value_or(0) + entry.data_details->cookie_count);
    site.Set("size", site.FindDouble("size").value_or(0) + entry.data_details->storage_size);
    base::ListValue* kinds = site.EnsureList("kinds");
    for (StorageType type : entry.data_details->storage_types) {
      const base::Value word(WordFor(type));
      if (!std::ranges::contains(*kinds, word)) kinds->Append(word.Clone());
    }
  }
  base::ListValue list;
  for (auto& [host, site] : sites) list.Append(std::move(site));
  return list;
}

// The names of the cookies `profile` would send to `page`; names only, never values.
void CookieNames(Profile* profile, const GURL& page, base::OnceCallback<void(base::ListValue)> done) {
  profile->GetDefaultStoragePartition()->GetCookieManagerForBrowserProcess()->GetCookieList(
      page, net::CookieOptions::MakeAllInclusive(), net::CookiePartitionKeyCollection::ContainsAll(),
      base::BindOnce([](const net::CookieAccessResultList& cookies, const net::CookieAccessResultList&) {
        base::ListValue names;
        for (const net::CookieWithAccessResult& cookie : cookies) names.Append(cookie.cookie.Name());
        return names;
      }).Then(std::move(done)));
}

// Both counts for the page, the sandbox's first.
void CompareCookies(Profile* sandbox, const GURL& page, base::OnceCallback<void(base::Value)> done) {
  if (!page.SchemeIsHTTPOrHTTPS()) return std::move(done).Run(base::Value());
  auto both = base::BindOnce(
      [](std::string host, base::ListValue in_sandbox, base::ListValue in_normal) {
        return base::Value(
            base::DictValue().Set("host", host).Set("sandbox", std::move(in_sandbox)).Set("normal", std::move(in_normal)));
      },
      page.GetHost());
  CookieNames(sandbox, page,
              base::BindOnce(
                  [](base::WeakPtr<Profile> normal, GURL page, decltype(both) both,
                     base::OnceCallback<void(base::Value)> done, base::ListValue in_sandbox) {
                    if (!normal) return std::move(done).Run(base::Value());
                    CookieNames(normal.get(), page,
                                base::BindOnce(std::move(both), std::move(in_sandbox)).Then(std::move(done)));
                  },
                  sandbox->GetOriginalProfile()->GetWeakPtr(), page, std::move(both), std::move(done)));
}

}  // namespace

void LeechSandboxReport(Profile* sandbox, const GURL& page, base::OnceCallback<void(base::Value)> done) {
  const double made = LeechSandboxMade(sandbox).InSecondsFSinceUnixEpoch();
  auto finish = base::BindOnce(
      [](double made, base::OnceCallback<void(base::Value)> done, base::ListValue sites, base::Value here) {
        std::move(done).Run(
            base::Value(base::DictValue().Set("made", made).Set("sites", std::move(sites)).Set("here", std::move(here))));
      },
      made, std::move(done));
  BrowsingDataModel::BuildFromDisk(
      sandbox, ChromeBrowsingDataModelDelegate::CreateForProfile(sandbox),
      base::BindOnce(
          [](base::WeakPtr<Profile> sandbox, GURL page, decltype(finish) finish,
             std::unique_ptr<BrowsingDataModel> model) {
            if (!sandbox) return;
            CompareCookies(sandbox.get(), page, base::BindOnce(std::move(finish), Sites(*model)));
          },
          sandbox->GetWeakPtr(), page, std::move(finish)));
}
