// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_PAGE_LEECH_GUEST_H_
#define CHROME_BROWSER_UI_LEECH_PAGE_LEECH_GUEST_H_

#include <string>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/values.h"
#include "content/public/browser/global_routing_id.h"

namespace content {
class RenderFrameHost;
}

// The page script (ui/guest/) as the Chromium build runs it: chromium.js, the UI's config and page.js in one
// function, in Chrome's internal isolated world, where the page's own scripts can't reach it.
class GuestScript {
 public:
  GuestScript();
  GuestScript(const GuestScript&) = delete;
  GuestScript& operator=(const GuestScript&) = delete;
  ~GuestScript();

  // Reads both files from the UI folder; `done` runs once they are in, or failed to be read.
  void Load(const base::FilePath& ui_folder, base::OnceClosure done);
  // The UI's L.configure, seen by every page that starts after it.
  void Configure(const base::Value& config);
  std::u16string Source() const;

 private:
  std::string chromium_;
  std::string page_;
  std::string config_ = "{}";
  base::WeakPtrFactory<GuestScript> weak_factory_{this};
};

// One tab's line to its page script. Started on each new document, it asks the script for its messages with
// a promise that settles once there are some, hands each on, and asks again.
class GuestChannel {
 public:
  using Heard = base::RepeatingCallback<void(const std::string& channel, base::Value args)>;

  GuestChannel(const GuestScript* script, Heard heard);
  GuestChannel(const GuestChannel&) = delete;
  GuestChannel& operator=(const GuestChannel&) = delete;
  ~GuestChannel();

  void Start(content::RenderFrameHost* frame);

 private:
  void Ask();
  void Took(int document, base::Value messages);

  raw_ptr<const GuestScript> script_;
  Heard heard_;
  content::GlobalRenderFrameHostId frame_;
  // Which document the last answer belongs to: one from a page already left is dropped.
  int document_ = 0;
  base::WeakPtrFactory<GuestChannel> weak_factory_{this};
};

#endif  // CHROME_BROWSER_UI_LEECH_PAGE_LEECH_GUEST_H_
