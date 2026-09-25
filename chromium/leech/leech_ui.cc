// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/leech_ui.h"

#include <map>
#include <memory>
#include <string>

#include "base/base_paths.h"
#include "base/environment.h"
#include "base/files/file_path.h"
#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/functional/bind.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/ref_counted_memory.h"
#include "base/memory/weak_ptr.h"
#include "base/path_service.h"
#include "base/scoped_multi_source_observation.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/sequenced_task_runner.h"
#include "base/task/thread_pool.h"
#include "base/version_info/version_info.h"
#include "chrome/browser/devtools/devtools_window.h"
#include "chrome/browser/lifetime/application_lifetime.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/shell_integration.h"
#include "chrome/browser/themes/theme_service.h"
#include "chrome/browser/themes/theme_service_factory.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_commands.h"
#include "chrome/browser/ui/browser_tabstrip.h"
#include "chrome/browser/ui/leech/leech_view.h"
#include "chrome/browser/ui/simple_message_box.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/tabs/tab_strip_model_observer.h"
#include "chrome/common/chrome_isolated_world_ids.h"
#include "components/favicon/content/content_favicon_driver.h"
#include "components/favicon/core/favicon_driver_observer.h"
#include "components/find_in_page/find_result_observer.h"
#include "components/find_in_page/find_tab_helper.h"
#include "components/find_in_page/find_types.h"
#include "components/zoom/zoom_controller.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/browser/web_ui_message_handler.h"
#include "third_party/blink/public/common/page/page_zoom.h"
#include "third_party/re2/src/re2/re2.h"
#include "ui/base/clipboard/clipboard.h"
#include "ui/base/clipboard/scoped_clipboard_writer.h"
#include "ui/base/webui/web_ui_util.h"
#include "ui/gfx/image/image.h"
#include "ui/views/widget/widget.h"

namespace {

// ponytail: the UI is served from a folder at run time, not packed into the binary with grit;
// grit resources when Leech ships as one file.
base::FilePath UIFolder() {
  if (auto dir = base::Environment::Create()->GetVar("LEECH_UI_DIR")) {
    return base::FilePath(*dir);
  }
  return base::PathService::CheckedGet(base::DIR_EXE).AppendASCII("leech-ui");
}

void ServeFile(const std::string& path, content::WebUIDataSource::GotDataCallback done) {
  // The path comes from the renderer: no way out of the folder.
  const std::string name = path.empty() ? "index.html" : path.substr(0, path.find_first_of("?#"));
  if (name.find("..") != std::string::npos || name.starts_with("/")) {
    std::move(done).Run(nullptr);
    return;
  }
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock()},
      base::BindOnce(
          [](base::FilePath file) -> scoped_refptr<base::RefCountedMemory> {
            std::string bytes;
            if (!base::ReadFileToString(file, &bytes)) {
              return nullptr;
            }
            return base::MakeRefCounted<base::RefCountedString>(std::move(bytes));
          },
          UIFolder().AppendASCII(name)),
      std::move(done));
}

std::string DataURL(const gfx::Image& image) {
  return image.IsEmpty() ? std::string() : webui::GetBitmapDataUrl(image.AsBitmap());
}

// One open page, reported to the UI in the shape of Electron's <webview> events.
class TabWatch : public content::WebContentsObserver,
                 public favicon::FaviconDriverObserver,
                 public find_in_page::FindResultObserver {
 public:
  using Emit = base::RepeatingCallback<void(const std::string& id,
                                            const std::string& type,
                                            base::DictValue data)>;

  TabWatch(std::string id, content::WebContents* contents, Emit emit)
      : id_(std::move(id)), emit_(std::move(emit)) {
    Watch(contents);
  }

  ~TabWatch() override { Unwatch(); }

  void Watch(content::WebContents* contents) {
    Unwatch();
    Observe(contents);
    if (auto* driver = favicon::ContentFaviconDriver::FromWebContents(contents)) {
      driver->AddObserver(this);
    }
    if (auto* find = find_in_page::FindTabHelper::FromWebContents(contents)) {
      find->AddObserver(this);
    }
  }

  const std::string& id() const { return id_; }

 private:
  void Unwatch() {
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

  void Send(const std::string& type, base::DictValue data = {}) {
    content::NavigationController& nav = web_contents()->GetController();
    data.Set("canGoBack", nav.CanGoBack());
    data.Set("canGoForward", nav.CanGoForward());
    emit_.Run(id_, type, std::move(data));
  }

  // content::WebContentsObserver:
  void DidStartLoading() override { Send("did-start-loading"); }
  void DidStopLoading() override { Send("did-stop-loading"); }
  void DOMContentLoaded(content::RenderFrameHost* frame) override {
    if (frame->IsInPrimaryMainFrame()) Send("dom-ready");
  }
  void DidFinishLoad(content::RenderFrameHost* frame, const GURL&) override {
    if (frame->IsInPrimaryMainFrame()) Send("did-finish-load");
  }
  void TitleWasSetForMainFrame(content::RenderFrameHost*) override {
    Send("page-title-updated",
         base::DictValue().Set("title", base::UTF16ToUTF8(web_contents()->GetTitle())));
  }
  void DidFinishNavigation(content::NavigationHandle* nav) override {
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
  }
  void OnAudioStateChanged(bool audible) override {
    Send(audible ? "media-started-playing" : "media-paused");
  }
  void DidToggleFullscreenModeForTab(bool entered, bool) override {
    Send(entered ? "enter-html-full-screen" : "leave-html-full-screen");
  }

  // favicon::FaviconDriverObserver:
  void OnFaviconUpdated(favicon::FaviconDriver*, NotificationIconType type, const GURL&,
                        bool, const gfx::Image& image) override {
    if (type != NON_TOUCH_16_DIP) {
      return;
    }
    const std::string url = DataURL(image);
    if (url.empty()) {
      return;
    }
    Send("page-favicon-updated", base::DictValue().Set("favicons", base::ListValue().Append(url)));
  }

  // find_in_page::FindResultObserver:
  void OnFindResultAvailable(content::WebContents* contents) override {
    const auto& found = find_in_page::FindTabHelper::FromWebContents(contents)->find_result();
    Send("found-in-page", base::DictValue().Set(
                              "result", base::DictValue()
                                            .Set("matches", found.number_of_matches())
                                            .Set("activeMatchOrdinal", found.active_match_ordinal())
                                            .Set("finalUpdate", found.final_update())));
  }

  std::string id_;
  Emit emit_;
};

// The UI's side of the browser: tabs, files, the window. Only chrome://leech in a LeechView
// gets one.
class LeechHandler : public content::WebUIMessageHandler, public TabStripModelObserver {
 public:
  explicit LeechHandler(LeechView* view) : view_(view) {}
  ~LeechHandler() override {
    if (observing_) {
      view_->browser()->tab_strip_model()->RemoveObserver(this);
    }
  }

  void RegisterMessages() override {
    web_ui()->RegisterMessageCallback(
        "leech", base::BindRepeating(&LeechHandler::OnCall, base::Unretained(this)));
  }

 private:
  TabStripModel* strip() { return view_->browser()->tab_strip_model(); }
  Profile* profile() { return view_->browser()->GetProfile(); }

  base::FilePath StoreFile(const std::string& name) {
    return profile()->GetPath().AppendASCII("Leech").AppendASCII(name + ".json");
  }

  void Reply(const base::Value& call, base::Value result) {
    base::Value reply(call.Clone());
    web_ui()->CallJavascriptFunctionUnsafe("leechReply", {reply, result});
  }

  void EmitTab(const std::string& id, const std::string& type, base::DictValue data) {
    view_->Emit("tab", base::ListValue().Append(id).Append(type).Append(std::move(data)));
  }

  content::WebContents* Find(const std::string& id) {
    auto it = tabs_.find(id);
    return it == tabs_.end() ? nullptr : it->second->web_contents();
  }

  std::string IdOf(content::WebContents* contents) {
    for (const auto& [id, watch] : tabs_) {
      if (watch->web_contents() == contents) return id;
    }
    return std::string();
  }

  void Track(const std::string& id, content::WebContents* contents) {
    tabs_[id] = std::make_unique<TabWatch>(
        id, contents,
        base::BindRepeating(&LeechHandler::EmitTab, weak_factory_.GetWeakPtr()));
  }

  // chrome.send('leech', [callId, method, ...args]); every call is answered through leechReply.
  void OnCall(const base::ListValue& args) {
    if (args.size() < 2 || !args[1].is_string()) {
      return;
    }
    AllowJavascript();
    const base::Value& call = args[0];
    const std::string& method = args[1].GetString();
    auto arg = [&](size_t i) -> const base::Value& {
      static const base::NoDestructor<base::Value> none;
      return i + 2 < args.size() ? args[i + 2] : *none;
    };
    auto text = [&](size_t i) { return arg(i).is_string() ? arg(i).GetString() : std::string(); };

    if (method == "boot") {
      Boot();
      Reply(call, base::Value(base::DictValue()
                                  .Set("version", std::string(version_info::GetVersionNumber()))
                                  .Set("platform", "linux")
                                  .Set("private", profile()->IsOffTheRecord())));
    } else if (method == "read") {
      if (!RE2::FullMatch(text(0), "[a-z0-9-]+")) return Reply(call, base::Value());
      base::ThreadPool::PostTaskAndReplyWithResult(
          FROM_HERE, {base::MayBlock()},
          base::BindOnce(
              [](base::FilePath file) {
                std::string json;
                return base::ReadFileToString(file, &json) ? base::Value(json) : base::Value();
              },
              StoreFile(text(0))),
          base::BindOnce(&LeechHandler::Reply, weak_factory_.GetWeakPtr(), call.Clone()));
    } else if (method == "write" || method == "remove") {
      // ponytail: a private window reads the store but never writes it; its own store when needed.
      if (!RE2::FullMatch(text(0), "[a-z0-9-]+") || profile()->IsOffTheRecord()) {
        return Reply(call, base::Value());
      }
      Writer()->PostTask(FROM_HERE, base::BindOnce(
                                        [](base::FilePath file, std::string json, bool remove) {
                                          if (remove) {
                                            base::DeleteFile(file);
                                            return;
                                          }
                                          base::CreateDirectory(file.DirName());
                                          base::ImportantFileWriter::WriteFileAtomically(file, json);
                                        },
                                        StoreFile(text(0)), text(1), method == "remove"));
      Reply(call, base::Value());
    } else if (method == "copy") {
      ui::ScopedClipboardWriter(ui::ClipboardBuffer::kCopyPaste).WriteText(base::UTF8ToUTF16(text(0)));
      Reply(call, base::Value());
    } else if (method == "paste") {
      ui::Clipboard::GetForCurrentThread()->ReadText(
          ui::ClipboardBuffer::kCopyPaste, std::nullopt,
          base::BindOnce(
              [](base::WeakPtr<LeechHandler> self, base::Value call, std::u16string pasted) {
                if (self) self->Reply(call, base::Value(base::UTF16ToUTF8(pasted)));
              },
              weak_factory_.GetWeakPtr(), call.Clone()));
    } else if (method == "confirm") {
      chrome::ShowQuestionMessageBoxAsync(
          view_->GetWidget()->GetNativeWindow(), base::UTF8ToUTF16(text(0)),
          base::UTF8ToUTF16(text(1)),
          base::BindOnce(
              [](base::WeakPtr<LeechHandler> self, base::Value call, chrome::MessageBoxResult r) {
                if (self) self->Reply(call, base::Value(r == chrome::MESSAGE_BOX_RESULT_YES));
              },
              weak_factory_.GetWeakPtr(), call.Clone()));
    } else if (method == "window") {
      Window(text(0));
      Reply(call, base::Value());
    } else if (method == "look") {
      const std::string& look = text(0);
      ThemeServiceFactory::GetForProfile(profile())->SetBrowserColorScheme(
          look == "dark"    ? ThemeService::BrowserColorScheme::kDark
          : look == "light" ? ThemeService::BrowserColorScheme::kLight
                            : ThemeService::BrowserColorScheme::kSystem);
      Reply(call, base::Value());
    } else if (method == "focus-ui") {
      view_->RequestFocus();
      Reply(call, base::Value());
    } else if (method == "escapable") {
      view_->SetEscapable(arg(0).GetIfBool().value_or(false));
      Reply(call, base::Value());
    } else if (method == "slide") {
      // The new place first, laid out now so the glide starts from exactly the old one.
      Stage(arg(0));
      view_->parent()->DeprecatedLayoutImmediately();
      LeechView::Slide(strip()->GetActiveWebContents(), gfx::Vector2d(arg(1).GetIfInt().value_or(0), arg(2).GetIfInt().value_or(0)),
                   base::Milliseconds(arg(3).GetIfInt().value_or(0)));
      Reply(call, base::Value());
    } else if (method == "stage") {
      Stage(arg(0));
      Reply(call, base::Value());
    } else if (method == "default-browser") {
      auto worker = base::MakeRefCounted<shell_integration::DefaultBrowserWorker>();
      auto done = base::BindOnce(
          [](base::WeakPtr<LeechHandler> self, base::Value call,
             shell_integration::DefaultWebClientState state) {
            if (self) self->Reply(call, base::Value(state == shell_integration::IS_DEFAULT));
          },
          weak_factory_.GetWeakPtr(), call.Clone());
      arg(0).GetIfBool().value_or(false) ? worker->StartSetAsDefault(std::move(done))
                                         : worker->StartCheckIsDefault(std::move(done));
    } else if (method == "open-page") {
      // Opened like a link to a new tab, so the UI takes it in through "opened".
      chrome::AddTabAt(view_->browser(), GURL(text(0)), -1, true);
      Reply(call, base::Value());
    } else if (method == "tab-create") {
      Create(text(0), GURL(text(1)), arg(2).GetIfBool().value_or(false));
      Reply(call, base::Value());
    } else if (method == "tab-show") {
      Show(Find(text(0)));
      Reply(call, base::Value());
    } else if (method == "tab") {
      TabCall(call, Find(text(0)), text(1), arg(2), arg(3));
    } else {
      Reply(call, base::Value());
    }
  }

  scoped_refptr<base::SequencedTaskRunner> Writer() {
    if (!writer_) {
      writer_ = base::ThreadPool::CreateSequencedTaskRunner(
          {base::MayBlock(), base::TaskShutdownBehavior::BLOCK_SHUTDOWN});
    }
    return writer_;
  }

  // The window must always hold a tab: one blank keeper stays under a blank page in the UI.
  void Boot() {
    if (!observing_) {
      strip()->AddObserver(this);
      observing_ = true;
    }
    tabs_.clear();
    while (strip()->count() > 1) {
      strip()->CloseWebContentsAt(strip()->count() - 1, TabCloseTypes::CLOSE_NONE);
    }
    keeper_ = strip()->count() ? strip()->GetWebContentsAt(0) : nullptr;
    if (keeper_) {
      keeper_->GetController().LoadURL(GURL("about:blank"), content::Referrer(),
                                       ui::PAGE_TRANSITION_AUTO_TOPLEVEL, std::string());
    }
  }

  void Create(const std::string& id, const GURL& url, bool foreground) {
    if (id.empty() || tabs_.contains(id)) {
      return;
    }
    creating_ = id;
    content::WebContents* contents =
        chrome::AddAndReturnTabAt(view_->browser(), url, -1, foreground);
    creating_.clear();
    if (contents && !tabs_.contains(id)) {
      Track(id, contents);
    }
  }

  void Show(content::WebContents* contents) {
    if (!contents) contents = keeper_;
    const int index = contents ? strip()->GetIndexOfWebContents(contents) : TabStripModel::kNoTab;
    if (index != TabStripModel::kNoTab && index != strip()->active_index()) {
      strip()->ActivateTabAt(index);
    }
  }

  void Stage(const base::Value& stage) {
    const base::DictValue* dict = stage.GetIfDict();
    if (!dict) return;
    auto rect = [](const base::Value* v) {
      const base::ListValue* r = v ? v->GetIfList() : nullptr;
      if (!r || r->size() != 4) return gfx::Rect();
      return gfx::Rect((*r)[0].GetIfInt().value_or(0), (*r)[1].GetIfInt().value_or(0),
                       (*r)[2].GetIfInt().value_or(0), (*r)[3].GetIfInt().value_or(0));
    };
    std::vector<gfx::Rect> islands;
    if (const base::ListValue* list = dict->FindList("islands")) {
      for (const base::Value& island : *list) islands.push_back(rect(&island));
    }
    view_->SetStage(rect(dict->Find("rect")), dict->FindBool("holding").value_or(true),
                    std::move(islands));
  }

  void Window(const std::string& what) {
    views::Widget* widget = view_->GetWidget();
    if (what == "minimize") widget->Minimize();
    else if (what == "maximize") widget->IsMaximized() ? widget->Restore() : widget->Maximize();
    else if (what == "close") widget->Close();
    else if (what == "fullscreen") chrome::ToggleFullscreenMode(view_->browser(), true);
    else if (what == "quit") chrome::AttemptExit();
  }

  void TabCall(const base::Value& call, content::WebContents* contents, const std::string& what,
               const base::Value& a, const base::Value& b) {
    if (!contents) {
      return Reply(call, base::Value());
    }
    content::NavigationController& nav = contents->GetController();
    base::Value result;
    if (what == "loadURL") {
      nav.LoadURL(GURL(a.is_string() ? a.GetString() : ""), content::Referrer(),
                  ui::PAGE_TRANSITION_TYPED, std::string());
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
    } else if (what == "setAudioMuted") {
      contents->SetAudioMuted(a.GetIfBool().value_or(false));
    } else if (what == "setZoomFactor") {
      if (auto* zoom = zoom::ZoomController::FromWebContents(contents)) {
        zoom->SetZoomLevel(blink::ZoomFactorToZoomLevel(a.GetIfDouble().value_or(1)));
      }
    } else if (what == "focus") {
      contents->Focus();
    } else if (what == "print") {
      Show(contents);
      chrome::Print(view_->browser());
    } else if (what == "openDevTools") {
      DevToolsWindow::OpenDevToolsWindow(contents, DevToolsOpenedByAction::kMainMenuOrMainShortcut);
    } else if (what == "findInPage") {
      const base::DictValue* options = b.GetIfDict();
      find_in_page::FindTabHelper::FromWebContents(contents)->StartFinding(
          base::UTF8ToUTF16(a.is_string() ? a.GetString() : ""),
          options ? options->FindBool("forward").value_or(true) : true, false,
          options ? options->FindBool("findNext").value_or(false) : false);
    } else if (what == "stopFindInPage") {
      find_in_page::FindTabHelper::FromWebContents(contents)->StopFinding(
          find_in_page::SelectionAction::kKeep);
    } else if (what == "executeJavaScript") {
      contents->GetPrimaryMainFrame()->ExecuteJavaScriptInIsolatedWorld(
          base::UTF8ToUTF16(a.is_string() ? a.GetString() : ""),
          base::BindOnce(&LeechHandler::Reply, weak_factory_.GetWeakPtr(), call.Clone()),
          ISOLATED_WORLD_ID_CHROME_INTERNAL);
      return;
    } else if (what == "close") {
      const int index = strip()->GetIndexOfWebContents(contents);
      tabs_.erase(IdOf(contents));
      if (index != TabStripModel::kNoTab) {
        strip()->CloseWebContentsAt(index, TabCloseTypes::CLOSE_USER_GESTURE);
      }
    }
    Reply(call, std::move(result));
  }

  // TabStripModelObserver: tabs Chromium opened itself (links to new tabs, chrome:// pages)
  // become the UI's tabs; tabs closed from inside (window.close) leave it.
  void OnTabStripModelChanged(TabStripModel*, const TabStripModelChange& change,
                              const TabStripSelectionChange& selection) override {
    if (change.type() == TabStripModelChange::kInserted) {
      for (const auto& added : change.GetInsert()->contents) {
        if (!creating_.empty() || !IdOf(added.contents).empty() || added.contents == keeper_) {
          continue;
        }
        const std::string id = "n" + base::NumberToString(++opened_);
        Track(id, added.contents);
        view_->Emit("opened", base::ListValue()
                                  .Append(id)
                                  .Append(added.contents->GetVisibleURL().spec())
                                  .Append(selection.new_contents == added.contents.get()));
      }
    } else if (change.type() == TabStripModelChange::kRemoved) {
      for (const auto& gone : change.GetRemove()->contents) {
        if (gone.contents == keeper_) {
          keeper_ = nullptr;
          continue;
        }
        const std::string id = IdOf(gone.contents);
        if (id.empty()) continue;
        tabs_.erase(id);
        view_->Emit("tab", base::ListValue().Append(id).Append("close").Append(base::DictValue()));
      }
    } else if (change.type() == TabStripModelChange::kReplaced) {
      const auto* replace = change.GetReplace();
      const std::string id = IdOf(replace->old_contents);
      if (!id.empty()) tabs_[id]->Watch(replace->new_contents);
    }
  }

  raw_ptr<LeechView> view_;
  bool observing_ = false;
  raw_ptr<content::WebContents> keeper_ = nullptr;
  std::string creating_;
  int opened_ = 0;
  std::map<std::string, std::unique_ptr<TabWatch>> tabs_;
  scoped_refptr<base::SequencedTaskRunner> writer_;
  base::WeakPtrFactory<LeechHandler> weak_factory_{this};
};

}  // namespace

LeechUI::LeechUI(content::WebUI* web_ui) : content::WebUIController(web_ui) {
  content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
      web_ui->GetWebContents()->GetBrowserContext(), leech::kLeechHost);
  source->SetRequestFilter(base::BindRepeating([](const std::string&) { return true; }),
                           base::BindRepeating(&ServeFile));
  // The UI builds its DOM from strings and shows site icons from anywhere.
  source->DisableTrustedTypesCSP();
  source->OverrideContentSecurityPolicy(network::mojom::CSPDirectiveName::ImgSrc,
                                        "img-src * data: blob:;");
  if (LeechView* view = LeechView::ForContents(web_ui->GetWebContents())) {
    web_ui->AddMessageHandler(std::make_unique<LeechHandler>(view));
  }
}

LeechUI::~LeechUI() = default;
