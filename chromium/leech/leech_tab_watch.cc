// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/leech_tab_watch.h"

#include <algorithm>
#include <utility>

#include "base/strings/utf_string_conversions.h"
#include "components/favicon/content/content_favicon_driver.h"
#include "components/find_in_page/find_tab_helper.h"
#include "components/find_in_page/find_types.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_entry.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "skia/ext/image_operations.h"
#include "ui/base/webui/web_ui_util.h"
#include "ui/gfx/image/image.h"
#include "ui/gfx/image/image_skia.h"
#include "ui/gfx/image/image_skia_rep.h"

namespace {

// The icon's 2x picture, at most 32 px: sharp at the 16–18 px the UI draws it, and small enough
// to keep in the store.
std::string DataURL(const gfx::Image& image) {
  if (image.IsEmpty()) {
    return std::string();
  }
  constexpr int kMost = 32;
  SkBitmap bitmap = image.AsImageSkia().GetRepresentation(2.0f).GetBitmap();
  const int side = std::max(bitmap.width(), bitmap.height());
  if (side > kMost) {
    bitmap = skia::ImageOperations::Resize(bitmap, skia::ImageOperations::RESIZE_LANCZOS3,
                                           bitmap.width() * kMost / side,
                                           bitmap.height() * kMost / side);
  }
  return webui::GetBitmapDataUrl(bitmap);
}

}  // namespace

TabWatch::TabWatch(std::string id, content::WebContents* contents, Emit emit, const GuestScript* guest)
    : id_(std::move(id)),
      emit_(std::move(emit)),
      guest_(guest, base::BindRepeating(
                        [](TabWatch* self, const std::string& channel, base::Value args) {
                          self->Send("ipc-message", base::DictValue().Set("channel", channel).Set(
                                                        "args", std::move(args)));
                        },
                        // The channel is a member: it never outlives this.
                        base::Unretained(this))) {
  Watch(contents);
}

TabWatch::~TabWatch() {
  Unwatch();
}

void TabWatch::Watch(content::WebContents* contents) {
  Unwatch();
  Observe(contents);
  if (auto* driver = favicon::ContentFaviconDriver::FromWebContents(contents)) {
    driver->AddObserver(this);
  }
  if (auto* find = find_in_page::FindTabHelper::FromWebContents(contents)) {
    find->AddObserver(this);
  }
}

void TabWatch::Unwatch() {
  if (!web_contents()) {
    return;
  }
  if (auto* driver = favicon::ContentFaviconDriver::FromWebContents(web_contents())) {
    driver->RemoveObserver(this);
  }
  if (auto* find = find_in_page::FindTabHelper::FromWebContents(web_contents())) {
    find->RemoveObserver(this);
  }
  Observe(nullptr);
}

void TabWatch::Send(const std::string& type, base::DictValue data) {
  content::NavigationController& nav = web_contents()->GetController();
  data.Set("canGoBack", nav.CanGoBack());
  data.Set("canGoForward", nav.CanGoForward());
  emit_.Run(id_, type, std::move(data));
}

void TabWatch::DidStartLoading() {
  Send("did-start-loading");
}

void TabWatch::DidStopLoading() {
  Send("did-stop-loading");
}

void TabWatch::DOMContentLoaded(content::RenderFrameHost* frame) {
  if (frame->IsInPrimaryMainFrame()) Send("dom-ready");
}

void TabWatch::DidFinishLoad(content::RenderFrameHost* frame, const GURL&) {
  if (frame->IsInPrimaryMainFrame()) Send("did-finish-load");
}

void TabWatch::TitleWasSetForMainFrame(content::RenderFrameHost*) {
  Send("page-title-updated",
       base::DictValue().Set("title", base::UTF16ToUTF8(web_contents()->GetTitle())));
}

void TabWatch::DidFinishNavigation(content::NavigationHandle* nav) {
  if (!nav->IsInPrimaryMainFrame() || !nav->HasCommitted()) {
    return;
  }
  const std::string url = nav->GetURL().spec();
  if (nav->IsErrorPage()) {
    Send("did-fail-load", base::DictValue()
                              .Set("errorCode", nav->GetNetErrorCode())
                              .Set("validatedURL", url)
                              .Set("isMainFrame", true));
    return;
  }
  Send(nav->IsSameDocument() ? "did-navigate-in-page" : "did-navigate",
       base::DictValue().Set("url", url).Set("isMainFrame", true));
  // Back and forward land on an entry that knows its title already, and Chromium tells no change then.
  const content::NavigationEntry* entry = web_contents()->GetController().GetLastCommittedEntry();
  if (!nav->IsSameDocument() && entry && !entry->GetTitle().empty()) {
    Send("page-title-updated", base::DictValue().Set("title", base::UTF16ToUTF8(entry->GetTitle())));
  }
  if (!nav->IsSameDocument() && (nav->GetURL().SchemeIsHTTPOrHTTPS() || nav->GetURL().SchemeIsFile())) {
    guest_.Start(nav->GetRenderFrameHost());
  }
}

void TabWatch::OnAudioStateChanged(bool audible) {
  Send(audible ? "media-started-playing" : "media-paused");
}

void TabWatch::DidToggleFullscreenModeForTab(bool entered, bool) {
  Send(entered ? "enter-html-full-screen" : "leave-html-full-screen");
}

void TabWatch::OnFaviconUpdated(favicon::FaviconDriver*, NotificationIconType type, const GURL&,
                                bool, const gfx::Image& image) {
  if (type != NON_TOUCH_16_DIP) {
    return;
  }
  const std::string url = DataURL(image);
  if (url.empty()) {
    return;
  }
  Send("page-favicon-updated", base::DictValue().Set("favicons", base::ListValue().Append(url)));
}

void TabWatch::OnFindResultAvailable(content::WebContents* contents) {
  const auto& found = find_in_page::FindTabHelper::FromWebContents(contents)->find_result();
  Send("found-in-page", base::DictValue().Set(
                            "result", base::DictValue()
                                          .Set("matches", found.number_of_matches())
                                          .Set("activeMatchOrdinal", found.active_match_ordinal())
                                          .Set("finalUpdate", found.final_update())));
}
