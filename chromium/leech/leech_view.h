// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_LEECH_VIEW_H_
#define CHROME_BROWSER_UI_LEECH_LEECH_VIEW_H_

#include <string>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/values.h"
#include "content/public/browser/keyboard_event_processing_result.h"
#include "ui/aura/window_occlusion_tracker.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/views/controls/webview/unhandled_keyboard_event_handler.h"
#include "ui/views/controls/webview/webview.h"
#include "ui/views/view_tracker.h"
#include "ui/views/view_targeter_delegate.h"

class BrowserWindowInterface;
struct BrowserViewLayoutViews;

namespace input {
struct NativeWebKeyboardEvent;
}

// The whole window's chrome: chrome://leech, transparent, over everything. The
// page is a real tab laid out underneath, where the UI says its stage is; clicks
// inside the stage fall through to the page unless the UI is holding them.
class LeechView : public views::WebView, public views::ViewTargeterDelegate {
  METADATA_HEADER(LeechView, views::WebView)

 public:
  explicit LeechView(BrowserWindowInterface* browser);
  ~LeechView() override;

  static LeechView* ForBrowserView(const views::View* browser_view);
  static LeechView* ForContents(content::WebContents* contents);

  // Called at the end of every browser view layout.
  static void AfterLayout(const BrowserViewLayoutViews& views);

  // Where the layout puts the page inside `all`: the UI's stage, or all of it while the page is
  // fullscreen, without waiting for the UI to catch up.
  gfx::Rect PageBounds(const gfx::Rect& all) const;
  bool PageIsFullscreen() const;

  // A key the UI owns, from the page or from the UI itself; true when taken.
  bool TakeKey(const input::NativeWebKeyboardEvent& event);

  // From the UI: where the page goes ({rect, holding, islands}), and what of it the UI covers.
  void SetStage(const base::Value& stage);
  // From the UI: whether Esc is the UI's, and whether the element picker is on (Ctrl+Z then undoes a hiding).
  void SetEscapable(bool escapable, bool veiling) {
    escapable_ = escapable;
    veiling_ = veiling;
  }
  // From the UI: run an extension's action, its popup hanging from `at` ([x, y, w, h], the UI's door).
  void RunExtension(const std::string& id, const base::Value& at);

  // From the UI: a link's page in the peek panel, where the stage message's "peek" says; closing answers the
  // address it got to.
  void OpenPeek(const std::string& url);
  std::string ClosePeek();

  // Sends one event to the UI.
  void Emit(const std::string& name, base::ListValue args);

  bool TakesPoint(const gfx::Point& point) const;
  BrowserWindowInterface* browser() const { return browser_; }

  // content::WebContentsDelegate:
  content::KeyboardEventProcessingResult PreHandleKeyboardEvent(
      content::WebContents* source,
      const input::NativeWebKeyboardEvent& event) override;
  bool HandleKeyboardEvent(content::WebContents* source,
                           const input::NativeWebKeyboardEvent& event) override;

 private:
  // views::View:
  void AddedToWidget() override;

  void PlacePeek(const gfx::Rect& rect, float radius);

  // views::ViewTargeterDelegate:
  bool DoesIntersectRect(const views::View* target, const gfx::Rect& rect) const override;

  raw_ptr<BrowserWindowInterface> browser_;
  raw_ptr<views::View> extension_anchor_ = nullptr;
  gfx::Rect stage_;
  gfx::Rect peek_rect_;
  float peek_radius_ = 0;
  views::ViewTracker peek_;
  bool holding_ = true;
  bool escapable_ = false;
  bool veiling_ = false;
  std::vector<gfx::Rect> islands_;
  views::UnhandledKeyboardEventHandler unhandled_keys_;
  std::unique_ptr<aura::WindowOcclusionTracker::ScopedForceVisible> always_visible_;
};

#endif  // CHROME_BROWSER_UI_LEECH_LEECH_VIEW_H_
