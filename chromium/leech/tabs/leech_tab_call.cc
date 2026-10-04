// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/tabs/leech_tab_call.h"

#include <utility>

#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/devtools/devtools_window.h"
#include "chrome/browser/ui/browser_commands.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/leech/page/leech_sleep.h"
#include "chrome/browser/ui/leech/services/leech_split.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/common/chrome_isolated_world_ids.h"
#include "components/find_in_page/find_tab_helper.h"
#include "components/find_in_page/find_types.h"
#include "components/zoom/zoom_controller.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "third_party/blink/public/common/page/page_zoom.h"

namespace {

std::string Text(const base::Value& v) {
  return v.is_string() ? v.GetString() : std::string();
}

void Find(content::WebContents* contents, const base::Value& text, const base::Value& b) {
  const base::DictValue* options = b.GetIfDict();
  find_in_page::FindTabHelper::FromWebContents(contents)->StartFinding(
      base::UTF8ToUTF16(Text(text)), options ? options->FindBool("forward").value_or(true) : true, false,
      options ? options->FindBool("findNext").value_or(false) : false);
}

void Print(BrowserWindowInterface* browser, content::WebContents* contents) {
  TabStripModel* strip = browser->GetTabStripModel();
  const int index = strip->GetIndexOfWebContents(contents);
  if (index != TabStripModel::kNoTab && index != strip->active_index()) strip->ActivateTabAt(index);
  chrome::Print(browser);
}

}  // namespace

void LeechTabCall(BrowserWindowInterface* browser, content::WebContents* contents, content::WebContents* other,
                  const std::string& what, const base::Value& a, const base::Value& b,
                  base::OnceCallback<void(base::Value)> done) {
  content::NavigationController& nav = contents->GetController();
  base::Value result;
  if (what == "loadURL") {
    nav.LoadURL(GURL(Text(a)), content::Referrer(), ui::PAGE_TRANSITION_TYPED, std::string());
  } else if (what == "stop") {
    contents->Stop();
  } else if (what == "reload") {
    nav.Reload(content::ReloadType::NORMAL, true);
  } else if (what == "reloadIgnoringCache") {
    nav.Reload(content::ReloadType::BYPASSING_CACHE, true);
  } else if (what == "goBack" && nav.CanGoBack()) {
    nav.GoToOffset(-1);
  } else if (what == "goForward" && nav.CanGoForward()) {
    nav.GoToOffset(1);
  } else if (what == "split") {
    LeechSplit(browser->GetTabStripModel(), contents, other);
  } else if (what == "unsplit") {
    LeechUnsplit(browser->GetTabStripModel(), contents);
  } else if (what == "sleep") {
    result = base::Value(LeechSleep(contents));
  } else if (what == "wake") {
    LeechWake(contents);
  } else if (what == "setAudioMuted") {
    contents->SetAudioMuted(a.GetIfBool().value_or(false));
  } else if (what == "setZoomFactor") {
    if (auto* zoom = zoom::ZoomController::FromWebContents(contents)) {
      zoom->SetZoomLevel(blink::ZoomFactorToZoomLevel(a.GetIfDouble().value_or(1)));
    }
  } else if (what == "focus") {
    contents->Focus();
  } else if (what == "print") {
    Print(browser, contents);
  } else if (what == "openDevTools") {
    DevToolsWindow::OpenDevToolsWindow(contents, DevToolsOpenedByAction::kMainMenuOrMainShortcut);
  } else if (what == "findInPage") {
    Find(contents, a, b);
  } else if (what == "stopFindInPage") {
    find_in_page::FindTabHelper::FromWebContents(contents)->StopFinding(find_in_page::SelectionAction::kKeep);
  } else if (what == "executeJavaScript") {
    contents->GetPrimaryMainFrame()->ExecuteJavaScriptInIsolatedWorld(base::UTF8ToUTF16(Text(a)), std::move(done),
                                                                      ISOLATED_WORLD_ID_CHROME_INTERNAL);
    return;
  }
  std::move(done).Run(std::move(result));
}
