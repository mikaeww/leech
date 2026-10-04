// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_DOWNLOADS_LEECH_DOWNLOAD_LIST_H_
#define CHROME_BROWSER_UI_LEECH_DOWNLOADS_LEECH_DOWNLOAD_LIST_H_

#include <memory>
#include <string>

#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/timer/timer.h"
#include "base/values.h"
#include "components/download/content/public/all_download_item_notifier.h"

class Profile;

// The UI's Downloads panel over Chromium's own download list: what was downloaded, where it really went, how
// far a running one is; open, show, pause, resume, cancel, take off the list. Not for: where a download lands,
// which Chromium decides (with downloads/leech_downloads.h sorting it into a folder of its kind).
class LeechDownloadList : public download::AllDownloadItemNotifier::Observer {
 public:
  using Emit = base::RepeatingCallback<void(const std::string& name, base::ListValue args)>;

  // Changes reach the UI through `emit`: "downloads" ({folder, items}) and "download-progress" (running, fraction).
  LeechDownloadList(Profile* profile, Emit emit);
  ~LeechDownloadList() override;

  // "downloads" answers {folder, items}; "download" (what, path) opens, shows, pauses, resumes, cancels or
  // removes one; "downloads-clear" takes every finished one off the list; "downloads-folder-open" (path)
  // opens a folder inside the downloads folder.
  base::Value Call(const std::string& method, const base::ListValue& args);

  // download::AllDownloadItemNotifier::Observer:
  void OnDownloadCreated(content::DownloadManager* manager, download::DownloadItem* item) override;
  void OnDownloadUpdated(content::DownloadManager* manager, download::DownloadItem* item) override;
  void OnDownloadRemoved(content::DownloadManager* manager, download::DownloadItem* item) override;

 private:
  base::DictValue List();
  download::DownloadItem* ByPath(const std::string& path);
  void Act(const std::string& what, const std::string& path);
  void OpenFolder(const std::string& path);
  void Changed();
  void Send();

  raw_ptr<Profile> profile_;
  Emit emit_;
  std::unique_ptr<download::AllDownloadItemNotifier> notifier_;
  // A running download changes many times a second; the UI hears at most four times a second.
  base::OneShotTimer later_;
};

#endif  // CHROME_BROWSER_UI_LEECH_DOWNLOADS_LEECH_DOWNLOAD_LIST_H_
