// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_PAGE_LEECH_PEEK_H_
#define CHROME_BROWSER_UI_LEECH_PAGE_LEECH_PEEK_H_

#include "base/memory/raw_ptr.h"
#include "content/public/browser/keyboard_event_processing_result.h"
#include "ui/views/controls/webview/unhandled_keyboard_event_handler.h"
#include "ui/views/controls/webview/webview.h"

class LeechView;

namespace input {
struct NativeWebKeyboardEvent;
}

// A link's page in the peek panel: a page of its own, not a tab, laid out in the hole the UI's peek frame leaves,
// between the tab and the UI. Its keys go to the UI first, as a tab's do; links it opens elsewhere are dropped,
// since "Open as a tab" is the way to keep it.
class LeechPeek : public views::WebView {
  METADATA_HEADER(LeechPeek, views::WebView)

 public:
  LeechPeek(content::BrowserContext* context, LeechView* leech);
  LeechPeek(const LeechPeek&) = delete;
  LeechPeek& operator=(const LeechPeek&) = delete;
  ~LeechPeek() override;

  // content::WebContentsDelegate:
  content::KeyboardEventProcessingResult PreHandleKeyboardEvent(
      content::WebContents* source,
      const input::NativeWebKeyboardEvent& event) override;
  bool HandleKeyboardEvent(content::WebContents* source,
                           const input::NativeWebKeyboardEvent& event) override;

 private:
  raw_ptr<LeechView> leech_;
  views::UnhandledKeyboardEventHandler unhandled_keys_;
};

#endif  // CHROME_BROWSER_UI_LEECH_PAGE_LEECH_PEEK_H_
