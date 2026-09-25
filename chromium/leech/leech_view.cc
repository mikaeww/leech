// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/leech_view.h"

#include <algorithm>
#include <map>

#include "base/containers/fixed_flat_map.h"
#include "base/no_destructor.h"
#include "base/strings/string_util.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/leech/leech_ui.h"
#include "chrome/browser/ui/views/frame/layout/browser_view_layout.h"
#include "chrome/browser/ui/views/frame/multi_contents_view.h"
#include "chrome/browser/ui/views/frame/vertical_tab_strip_region_view.h"
#include "chrome/browser/ui/views/frame/tab_strip_region_view.h"
#include "chrome/browser/ui/views/infobars/infobar_container_view.h"
#include "components/input/native_web_keyboard_event.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "third_party/blink/public/common/input/web_input_event.h"
#include "third_party/skia/include/core/SkColor.h"
#include "ui/aura/window.h"
#include "ui/aura/window_targeter.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/events/keycodes/dom/keycode_converter.h"
#include "ui/gfx/geometry/point_conversions.h"
#include "ui/views/controls/webview/web_contents_set_background_color.h"
#include "ui/views/view_targeter.h"
#include "url/gurl.h"

namespace {

std::map<content::WebContents*, LeechView*>& Registry() {
  static base::NoDestructor<std::map<content::WebContents*, LeechView*>> map;
  return *map;
}

// Keys the UI answers wherever focus is, as in main.js of the Electron build.
constexpr auto kShortcuts = base::MakeFixedFlatMap<std::string_view, std::string_view>({
    {"ctrl+t", "new-tab"}, {"ctrl+shift+t", "reopen"}, {"ctrl+w", "close-tab"},
    {"ctrl+shift+n", "private-tab"}, {"ctrl+l", "edit"}, {"alt+d", "edit"},
    {"f6", "edit"}, {"ctrl+k", "summon"}, {"ctrl+r", "reload"}, {"f5", "reload"},
    {"ctrl+f5", "reload-hard"}, {"shift+f5", "reload-hard"},
    {"ctrl+shift+r", "reader"}, {"ctrl+shift+p", "pip"}, {"ctrl+[", "back"},
    {"ctrl+]", "forward"}, {"alt+arrowleft", "back"}, {"alt+arrowright", "forward"},
    {"ctrl+tab", "next-tab"}, {"ctrl+shift+tab", "previous-tab"},
    {"ctrl+pagedown", "next-tab"}, {"ctrl+pageup", "previous-tab"},
    {"ctrl+d", "duplicate"}, {"ctrl+alt+c", "copy-address"},
    {"ctrl+shift+v", "paste-and-go"}, {"ctrl+f", "find"}, {"ctrl+g", "find-next"},
    {"ctrl+shift+g", "find-previous"}, {"f3", "find-next"},
    {"ctrl+shift+s", "toggle-sidebar"}, {"ctrl+s", "fold"}, {"ctrl+shift+m", "mute"},
    {"ctrl+=", "zoom-in"}, {"ctrl++", "zoom-in"}, {"ctrl+shift++", "zoom-in"},
    {"ctrl+-", "zoom-out"}, {"ctrl+0", "zoom-reset"}, {"ctrl+,", "settings"},
    {"ctrl+h", "history"}, {"ctrl+y", "history"}, {"ctrl+j", "downloads"},
    {"ctrl+shift+b", "bookmark"}, {"ctrl+shift+o", "bookmarks"},
    {"ctrl+shift+h", "veil"}, {"ctrl+shift+u", "hidden"}, {"f11", "fullscreen"},
    {"ctrl+o", "open-file"}, {"ctrl+u", "view-source"}, {"ctrl+shift+i", "inspect"},
    {"f12", "inspect"}, {"ctrl+p", "print"}, {"ctrl+q", "quit"},
    {"ctrl+1", "tab-1"}, {"ctrl+2", "tab-2"}, {"ctrl+3", "tab-3"}, {"ctrl+4", "tab-4"},
    {"ctrl+5", "tab-5"}, {"ctrl+6", "tab-6"}, {"ctrl+7", "tab-7"}, {"ctrl+8", "tab-8"},
    {"ctrl+9", "tab-9"}, {"alt+1", "space-1"}, {"alt+2", "space-2"}, {"alt+3", "space-3"},
    {"alt+4", "space-4"}, {"alt+5", "space-5"}, {"alt+6", "space-6"}, {"alt+7", "space-7"},
    {"alt+8", "space-8"}, {"alt+9", "space-9"},
});

std::string Chord(const input::NativeWebKeyboardEvent& event) {
  const int mods = event.GetModifiers();
  std::string chord;
  if (mods & blink::WebInputEvent::kControlKey) chord += "ctrl+";
  if (mods & blink::WebInputEvent::kAltKey) chord += "alt+";
  if (mods & blink::WebInputEvent::kShiftKey) chord += "shift+";
  // Digits by physical key so Ctrl+1 works on every layout (Shift+1 is "!" on most).
  const std::string code = ui::KeycodeConverter::DomCodeToCodeString(
      static_cast<ui::DomCode>(event.dom_code));
  if (code.size() == 6 && code.starts_with("Digit")) {
    return chord + code.back();
  }
  return chord + base::ToLowerASCII(ui::KeycodeConverter::DomKeyToKeyString(
                     static_cast<ui::DomKey>(event.dom_key)));
}

// Lets clicks inside the stage through to the page below, unless the UI holds them.
class StageTargeter : public aura::WindowTargeter {
 public:
  explicit StageTargeter(LeechView* view) : view_(view) {}

  bool SubtreeShouldBeExploredForEvent(aura::Window* window,
                                       const ui::LocatedEvent& event) override {
    if (!aura::WindowTargeter::SubtreeShouldBeExploredForEvent(window, event)) {
      return false;
    }
    // The event arrives in the parent's coordinates.
    gfx::PointF point = event.location_f();
    aura::Window::ConvertPointToTarget(window->parent(), window, &point);
    return view_->TakesPoint(gfx::ToFlooredPoint(point));
  }

 private:
  raw_ptr<LeechView> view_;
};

}  // namespace

LeechView::LeechView(BrowserWindowInterface* browser)
    : views::WebView(browser->GetProfile()), browser_(browser) {
  content::WebContents* contents = GetWebContents();
  Registry()[contents] = this;
  views::WebContentsSetBackgroundColor::CreateForWebContentsWithColor(
      contents, SK_ColorTRANSPARENT);
  LoadInitialURL(GURL(leech::kLeechURL));
  // Views decides first whether a click may go down into the page's window, so the hole has
  // to exist for views too, not only for aura.
  SetEventTargeter(std::make_unique<views::ViewTargeter>(this));
}

bool LeechView::DoesIntersectRect(const views::View* target, const gfx::Rect& rect) const {
  return TakesPoint(rect.CenterPoint());
}

LeechView::~LeechView() {
  std::erase_if(Registry(), [this](const auto& entry) { return entry.second == this; });
}

// static
LeechView* LeechView::ForBrowserView(const views::View* browser_view) {
  for (views::View* child : browser_view->children()) {
    if (auto* view = views::AsViewClass<LeechView>(child)) {
      return view;
    }
  }
  return nullptr;
}

// static
LeechView* LeechView::ForContents(content::WebContents* contents) {
  auto it = Registry().find(contents);
  return it == Registry().end() ? nullptr : it->second;
}

// static
void LeechView::AfterLayout(const BrowserViewLayoutViews& views) {
  LeechView* leech = ForBrowserView(views.browser_view);
  if (!leech) {
    return;
  }
  // Chromium's own chrome stays alive (the omnibox, bubbles' anchors) but takes no room.
  for (views::View* hidden :
       {views.top_container.get(),
        static_cast<views::View*>(views.horizontal_tab_strip_region_view.get()),
        static_cast<views::View*>(views.vertical_tab_strip_region_view.get()),
        static_cast<views::View*>(views.infobar_container.get())}) {
    if (hidden) {
      hidden->SetBoundsRect(gfx::Rect());
    }
  }
  const gfx::Rect all = views.browser_view->GetLocalBounds();
  if (views.multi_contents_view) {
    views.multi_contents_view->SetBoundsRect(
        leech->stage_.IsEmpty() ? gfx::Rect() : gfx::IntersectRects(leech->stage_, all));
  }
  leech->SetBoundsRect(all);
  // The UI is see-through where the page is: it must not count as covering it, or Chromium
  // stops painting the page.
  if (aura::Window* window = leech->GetWebContents()->GetNativeView()) {
    // A tab attached before the UI would otherwise sit above it in aura, covering it for
    // occlusion and for clicks alike.
    if (window->parent() && window->parent()->children().back() != window) {
      window->parent()->StackChildAtTop(window);
    }
    window->SetTransparent(true);
    for (aura::Window* child : window->children()) child->SetTransparent(true);
  }
  if (views.browser_view->children().back() != leech) {
    views.browser_view->ReorderChildView(leech, views.browser_view->children().size());
  }
}

void LeechView::SetStage(const gfx::Rect& stage, bool holding, std::vector<gfx::Rect> islands) {
  holding_ = holding;
  islands_ = std::move(islands);
  if (stage == stage_) {
    return;
  }
  stage_ = stage;
  parent()->InvalidateLayout();
}

bool LeechView::TakesPoint(const gfx::Point& point) const {
  if (holding_ || !stage_.Contains(point)) {
    return true;
  }
  return std::ranges::any_of(islands_, [&](const gfx::Rect& r) { return r.Contains(point); });
}

bool LeechView::TakeKey(const input::NativeWebKeyboardEvent& event) {
  if (event.GetType() != blink::WebInputEvent::Type::kRawKeyDown) {
    return false;
  }
  const std::string chord = Chord(event);
  std::string_view action;
  if (chord == "escape") {
    if (!escapable_) {
      return false;
    }
    action = "escape";
  } else if (auto it = kShortcuts.find(chord); it != kShortcuts.end()) {
    action = it->second;
  } else {
    return false;
  }
  base::ListValue args;
  args.Append(action);
  Emit("shortcut", std::move(args));
  return true;
}

void LeechView::Emit(const std::string& name, base::ListValue args) {
  content::WebUI* web_ui = GetWebContents()->GetWebUI();
  if (!web_ui) {
    return;
  }
  base::Value event_name(name);
  base::Value event_args(std::move(args));
  web_ui->CallJavascriptFunctionUnsafe("leechEvent", {event_name, event_args});
}

content::KeyboardEventProcessingResult LeechView::PreHandleKeyboardEvent(
    content::WebContents* source,
    const input::NativeWebKeyboardEvent& event) {
  return TakeKey(event) ? content::KeyboardEventProcessingResult::HANDLED
                        : content::KeyboardEventProcessingResult::NOT_HANDLED;
}

bool LeechView::HandleKeyboardEvent(content::WebContents* source,
                                    const input::NativeWebKeyboardEvent& event) {
  return unhandled_keys_.HandleKeyboardEvent(event, GetFocusManager());
}

void LeechView::AddedToWidget() {
  views::WebView::AddedToWidget();
  GetWebContents()->GetNativeView()->SetEventTargeter(
      std::make_unique<StageTargeter>(this));
}

BEGIN_METADATA(LeechView)
END_METADATA
