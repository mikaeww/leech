// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/leech_view.h"

#include <algorithm>
#include <map>

#include "base/containers/fixed_flat_map.h"
#include "base/no_destructor.h"
#include "base/strings/string_util.h"
#include "chrome/browser/file_select_helper.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/leech/leech_ui.h"
#include "chrome/browser/ui/leech/page/leech_peek.h"
#include "chrome/browser/ui/leech/services/leech_extensions.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/views/frame/layout/browser_view_layout.h"
#include "chrome/browser/ui/views/frame/tab_strip_region_view.h"
#include "chrome/browser/ui/views/frame/vertical_tab_strip_region_view.h"
#include "chrome/browser/ui/views/infobars/infobar_container_view.h"
#include "components/input/native_web_keyboard_event.h"
#include "content/public/browser/file_select_listener.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "third_party/blink/public/common/input/web_input_event.h"
#include "third_party/skia/include/core/SkColor.h"
#include "ui/aura/window.h"
#include "ui/aura/window_targeter.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/events/keycodes/dom/keycode_converter.h"
#include "ui/gfx/geometry/point_conversions.h"
#include "ui/gfx/geometry/rounded_corners_f.h"
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

// [x, y, w, h] from the UI; anything else is an empty rect.
gfx::Rect RectFrom(const base::Value* v) {
  const base::ListValue* r = v ? v->GetIfList() : nullptr;
  if (!r || r->size() != 4) return gfx::Rect();
  return gfx::Rect((*r)[0].GetIfInt().value_or(0), (*r)[1].GetIfInt().value_or(0),
                   (*r)[2].GetIfInt().value_or(0), (*r)[3].GetIfInt().value_or(0));
}

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
  // Chromium's own chrome stays alive (the omnibox, bubbles' anchors) but takes no room. Its toolbar sits as a
  // point at the stage's top right, so the bubbles that hang from the omnibox's icons (save password, translate,
  // site info) hang there, as in Chrome, instead of over Leech's sidebar.
  const gfx::Rect page = leech->PageBounds(views.browser_view->GetLocalBounds());
  views.top_container->SetBoundsRect(gfx::Rect(page.top_right(), gfx::Size()));
  for (views::View* hidden :
       {static_cast<views::View*>(views.horizontal_tab_strip_region_view.get()),
        static_cast<views::View*>(views.vertical_tab_strip_region_view.get()),
        static_cast<views::View*>(views.infobar_container.get())}) {
    if (hidden) {
      hidden->SetBoundsRect(gfx::Rect());
    }
  }
  leech->SetBoundsRect(views.browser_view->GetLocalBounds());
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

bool LeechView::PageIsFullscreen() const {
  content::WebContents* page = browser_->GetTabStripModel()->GetActiveWebContents();
  return page && page->IsFullscreen();
}

gfx::Rect LeechView::PageBounds(const gfx::Rect& all) const {
  if (PageIsFullscreen()) {
    return all;
  }
  return stage_.IsEmpty() ? gfx::Rect() : gfx::IntersectRects(stage_, all);
}

void LeechView::RunExtension(const std::string& id, const base::Value& at) {
  if (!extension_anchor_) {
    extension_anchor_ = AddChildView(std::make_unique<views::View>());
    // Only a place for popups to hang from: clicks go on to the UI under it.
    extension_anchor_->SetCanProcessEventsWithinSubtree(false);
  }
  extension_anchor_->SetBoundsRect(RectFrom(&at));
  LeechRunExtension(browser_, extension_anchor_, id);
}

void LeechView::SetStage(const base::Value& message) {
  const base::DictValue* dict = message.GetIfDict();
  if (!dict) {
    return;
  }
  auto rect = RectFrom;
  islands_.clear();
  if (const base::ListValue* list = dict->FindList("islands")) {
    for (const base::Value& island : *list) islands_.push_back(rect(&island));
  }
  holding_ = dict->FindBool("holding").value_or(true);
  PlacePeek(rect(dict->Find("peek")), static_cast<float>(dict->FindDouble("peekRadius").value_or(0)));
  const gfx::Rect stage = rect(dict->Find("rect"));
  // The page's own fullscreen isn't the UI's to size; keeping the card's place lets the page
  // go straight back into it on leaving, instead of edge to edge first.
  if (stage == stage_ || PageIsFullscreen()) {
    return;
  }
  stage_ = stage;
  parent()->InvalidateLayout();
}

void LeechView::OpenPeek(const std::string& url) {
  auto* peek = views::AsViewClass<LeechPeek>(peek_.view());
  if (!peek) {
    // Just under the UI, over the tab: the UI dims everything around the hole it leaves for it.
    peek = parent()->AddChildViewAt(std::make_unique<LeechPeek>(browser_->GetProfile(), this),
                                    parent()->GetIndexOf(this).value_or(0));
    peek_.SetView(peek);
    peek->SetBoundsRect(peek_rect_);
    // AfterLayout puts the UI's window back on top of the one the peek just added.
    parent()->InvalidateLayout();
  }
  peek->LoadInitialURL(GURL(url));
}

std::string LeechView::ClosePeek() {
  auto* peek = views::AsViewClass<LeechPeek>(peek_.view());
  if (!peek) {
    return std::string();
  }
  const std::string url = peek->GetWebContents()->GetLastCommittedURL().spec();
  peek_.SetView(nullptr);
  parent()->RemoveChildViewT(peek);
  return url;
}

void LeechView::PlacePeek(const gfx::Rect& rect, float radius) {
  if (rect == peek_rect_ && radius == peek_radius_) {
    return;
  }
  peek_rect_ = rect;
  peek_radius_ = radius;
  if (auto* peek = views::AsViewClass<LeechPeek>(peek_.view())) {
    peek->SetBoundsRect(rect);
    peek->holder()->SetNativeViewCornerRadii(gfx::RoundedCornersF(radius));
  }
}

bool LeechView::TakesPoint(const gfx::Point& point) const {
  // A fullscreen page owns the whole window; the UI's last stage no longer says where it is.
  if (PageIsFullscreen()) {
    return false;
  }
  // The peek's page takes its own clicks, whatever the UI holds around it.
  if (peek_.view() && peek_rect_.Contains(point)) {
    return false;
  }
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
  } else if (chord == "ctrl+z" && veiling_) {
    action = "veil-undo";
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

void LeechView::RunFileChooser(content::RenderFrameHost* render_frame_host,
                               scoped_refptr<content::FileSelectListener> listener,
                               const blink::mojom::FileChooserParams& params) {
  FileSelectHelper::RunFileChooser(render_frame_host, std::move(listener), params);
}

void LeechView::AddedToWidget() {
  views::WebView::AddedToWidget();
  GetWebContents()->GetNativeView()->SetEventTargeter(
      std::make_unique<StageTargeter>(this));
  // The UI is the window: a page window stacked above it for a moment (a tab being attached)
  // must not make Chromium think it covered and stop drawing it.
  always_visible_ = std::make_unique<aura::WindowOcclusionTracker::ScopedForceVisible>(
      GetWebContents()->GetNativeView());
}

BEGIN_METADATA(LeechView)
END_METADATA
