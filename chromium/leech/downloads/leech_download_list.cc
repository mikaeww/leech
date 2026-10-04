// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/downloads/leech_download_list.h"

#include <algorithm>
#include <utility>
#include <vector>

#include "base/time/time.h"
#include "chrome/browser/download/download_prefs.h"
#include "chrome/browser/platform_util.h"
#include "chrome/browser/profiles/profile.h"
#include "components/download/public/common/download_item.h"
#include "content/public/browser/download_manager.h"
#include "url/gurl.h"

namespace {

constexpr size_t kMostListed = 200;

std::string StateOf(const download::DownloadItem& item) {
  switch (item.GetState()) {
    case download::DownloadItem::IN_PROGRESS:
      return item.IsPaused() ? "paused" : "running";
    case download::DownloadItem::COMPLETE:
      return item.GetFileExternallyRemoved() ? "gone" : "done";
    case download::DownloadItem::CANCELLED:
      return "cancelled";
    default:
      return "failed";
  }
}

std::string HostOf(const GURL& url) {
  std::string host = url.GetHost();
  return host.starts_with("www.") ? host.substr(4) : host;
}

base::DictValue Entry(const download::DownloadItem& item) {
  const base::Time when = item.IsDone() && !item.GetEndTime().is_null() ? item.GetEndTime() : item.GetStartTime();
  return base::DictValue()
      .Set("name", item.GetFileNameToReportUser().BaseName().value())
      .Set("path", item.GetTargetFilePath().value())
      .Set("from", HostOf(item.GetURL()))
      .Set("date", when.InSecondsFSinceUnixEpoch())
      .Set("state", StateOf(item))
      .Set("received", static_cast<double>(item.GetReceivedBytes()))
      .Set("total", static_cast<double>(item.GetTotalBytes()));
}

}  // namespace

LeechDownloadList::LeechDownloadList(Profile* profile, Emit emit) : profile_(profile), emit_(std::move(emit)) {
  notifier_ = std::make_unique<download::AllDownloadItemNotifier>(profile->GetDownloadManager(), this);
}

LeechDownloadList::~LeechDownloadList() = default;

base::Value LeechDownloadList::Call(const std::string& method, const base::ListValue& args) {
  auto text = [&](size_t i) { return i < args.size() && args[i].is_string() ? args[i].GetString() : std::string(); };
  if (method == "downloads") return base::Value(List());
  if (method == "download") Act(text(0), text(1));
  if (method == "downloads-folder-open") OpenFolder(text(0));
  if (method == "downloads-clear") {
    download::SimpleDownloadManager::DownloadVector items;
    profile_->GetDownloadManager()->GetAllDownloads(&items);
    for (download::DownloadItem* item : items) {
      if (item->IsDone()) item->Remove();
    }
  }
  return base::Value();
}

base::DictValue LeechDownloadList::List() {
  download::SimpleDownloadManager::DownloadVector items;
  profile_->GetDownloadManager()->GetAllDownloads(&items);
  // Transient ones (a page saving for itself) and ones still waiting for a name aren't the owner's downloads.
  std::erase_if(items, [](download::DownloadItem* item) {
    return item->IsTransient() || item->GetTargetFilePath().empty();
  });
  std::sort(items.begin(), items.end(), [](download::DownloadItem* a, download::DownloadItem* b) {
    return a->GetStartTime() > b->GetStartTime();
  });
  base::ListValue list;
  for (size_t i = 0; i < items.size() && i < kMostListed; i++) list.Append(Entry(*items[i]));
  return base::DictValue()
      .Set("folder", DownloadPrefs::FromBrowserContext(profile_)->DownloadPath().value())
      .Set("items", std::move(list));
}

download::DownloadItem* LeechDownloadList::ByPath(const std::string& path) {
  download::SimpleDownloadManager::DownloadVector items;
  profile_->GetDownloadManager()->GetAllDownloads(&items);
  for (download::DownloadItem* item : items) {
    if (!path.empty() && item->GetTargetFilePath().value() == path) return item;
  }
  return nullptr;
}

void LeechDownloadList::Act(const std::string& what, const std::string& path) {
  download::DownloadItem* item = ByPath(path);
  if (!item) return;
  if (what == "open" && item->GetState() == download::DownloadItem::COMPLETE) item->OpenDownload();
  else if (what == "show") item->ShowDownloadInShell();
  else if (what == "pause") item->Pause();
  else if (what == "resume" && item->CanResume()) item->Resume(/*user_resume=*/true);
  else if (what == "cancel") item->Cancel(/*user_cancel=*/true);
  else if (what == "remove") item->Remove();
}

// Only the downloads folder and what is under it: the path comes from the UI's page.
void LeechDownloadList::OpenFolder(const std::string& path) {
  const base::FilePath root = DownloadPrefs::FromBrowserContext(profile_)->DownloadPath();
  const base::FilePath folder(path);
  if (folder.ReferencesParent() || !(folder == root || root.IsParent(folder))) return;
  platform_util::OpenItem(profile_, folder, platform_util::OPEN_FOLDER, platform_util::OpenOperationCallback());
}

void LeechDownloadList::OnDownloadCreated(content::DownloadManager*, download::DownloadItem*) {
  Changed();
}

void LeechDownloadList::OnDownloadUpdated(content::DownloadManager*, download::DownloadItem*) {
  Changed();
}

void LeechDownloadList::OnDownloadRemoved(content::DownloadManager*, download::DownloadItem*) {
  Changed();
}

void LeechDownloadList::Changed() {
  if (!later_.IsRunning()) later_.Start(FROM_HERE, base::Milliseconds(250), this, &LeechDownloadList::Send);
}

void LeechDownloadList::Send() {
  base::DictValue list = List();
  double got = 0;
  double total = 0;
  int running = 0;
  for (const base::Value& entry : *list.FindList("items")) {
    const base::DictValue& d = entry.GetDict();
    if (*d.FindString("state") != "running" && *d.FindString("state") != "paused") continue;
    running++;
    got += d.FindDouble("received").value_or(0);
    total += std::max(0.0, d.FindDouble("total").value_or(0));
  }
  emit_.Run("download-progress", base::ListValue().Append(running).Append(total > 0 ? base::Value(got / total) : base::Value()));
  emit_.Run("downloads", base::ListValue().Append(std::move(list)));
}
