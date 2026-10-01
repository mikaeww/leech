// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_LEECH_TAB_WATCH_H_
#define CHROME_BROWSER_UI_LEECH_LEECH_TAB_WATCH_H_

#include <string>

#include "base/functional/callback.h"
#include "base/values.h"
#include "chrome/browser/ui/leech/page/leech_guest.h"
#include "components/favicon/core/favicon_driver_observer.h"
#include "components/find_in_page/find_result_observer.h"
#include "content/public/browser/web_contents_observer.h"

// One open page, reported to the UI in the shape of Electron's <webview> events; what its page script
// says arrives as "ipc-message", as from a webview's preload.
class TabWatch : public content::WebContentsObserver,
                 public favicon::FaviconDriverObserver,
                 public find_in_page::FindResultObserver {
 public:
  using Emit = base::RepeatingCallback<void(const std::string& id,
                                            const std::string& type,
                                            base::DictValue data)>;

  TabWatch(std::string id, content::WebContents* contents, Emit emit, const GuestScript* guest);
  TabWatch(const TabWatch&) = delete;
  TabWatch& operator=(const TabWatch&) = delete;
  ~TabWatch() override;

  void Watch(content::WebContents* contents);
  const std::string& id() const { return id_; }

 private:
  void Unwatch();
  void Send(const std::string& type, base::DictValue data = {});

  // content::WebContentsObserver:
  void DidStartLoading() override;
  void DidStopLoading() override;
  void DOMContentLoaded(content::RenderFrameHost* frame) override;
  void DidFinishLoad(content::RenderFrameHost* frame, const GURL&) override;
  void TitleWasSetForMainFrame(content::RenderFrameHost*) override;
  void DidFinishNavigation(content::NavigationHandle* nav) override;
  void OnAudioStateChanged(bool audible) override;
  void DidToggleFullscreenModeForTab(bool entered, bool) override;

  // favicon::FaviconDriverObserver:
  void OnFaviconUpdated(favicon::FaviconDriver*, NotificationIconType type, const GURL&,
                        bool, const gfx::Image& image) override;

  // find_in_page::FindResultObserver:
  void OnFindResultAvailable(content::WebContents* contents) override;

  std::string id_;
  Emit emit_;
  GuestChannel guest_;
};

#endif  // CHROME_BROWSER_UI_LEECH_LEECH_TAB_WATCH_H_
