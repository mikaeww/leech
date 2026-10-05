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
#include "base/functional/bind.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/ref_counted_memory.h"
#include "base/memory/weak_ptr.h"
#include "base/path_service.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/thread_pool.h"
#include "base/version_info/version_info.h"
#include "chrome/browser/download/download_prefs.h"
#include "chrome/browser/lifetime/application_lifetime.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/themes/theme_service.h"
#include "chrome/browser/themes/theme_service_factory.h"
#include "chrome/browser/ui/browser_commands.h"
#include "chrome/browser/ui/browser_tabstrip.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/leech/downloads/leech_download_list.h"
#include "chrome/browser/ui/leech/downloads/leech_downloads.h"
#include "chrome/browser/ui/leech/files/leech_store.h"
#include "chrome/browser/ui/leech/leech_default_browser.h"
#include "chrome/browser/ui/leech/leech_tab_watch.h"
#include "chrome/browser/ui/leech/leech_view.h"
#include "chrome/browser/ui/leech/page/leech_guest.h"
#include "chrome/browser/ui/leech/page/leech_shield.h"
#include "chrome/browser/ui/leech/services/leech_extensions.h"
#include "chrome/browser/ui/leech/passwords/leech_passwords.h"
#include "chrome/browser/ui/leech/sandbox/leech_sandbox.h"
#include "chrome/browser/ui/leech/sandbox/leech_sandbox_report.h"
#include "chrome/browser/ui/leech/services/leech_prefs.h"
#include "chrome/browser/ui/leech/services/leech_suggest.h"
#include "chrome/browser/ui/leech/tabs/leech_tab_call.h"
#include "chrome/browser/ui/simple_message_box.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/tabs/tab_strip_model_observer.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/storage_partition.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/browser/web_ui_message_handler.h"
#include "ui/base/clipboard/clipboard.h"
#include "ui/base/clipboard/scoped_clipboard_writer.h"
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

// The UI's side of the browser: tabs, files, the window. Only chrome://leech in a LeechView
// gets one.
class LeechHandler : public content::WebUIMessageHandler, public TabStripModelObserver {
 public:
  // No destructor of its own: this dies inside ~LeechView, when view_ is already half gone;
  // ~TabStripModelObserver unregisters from the strip by itself.
  explicit LeechHandler(LeechView* view) : view_(view) {}

  void RegisterMessages() override {
    web_ui()->RegisterMessageCallback(
        "leech", base::BindRepeating(&LeechHandler::OnCall, base::Unretained(this)));
  }

 private:
  TabStripModel* strip() { return view_->browser()->tab_strip_model(); }
  Profile* profile() { return view_->browser()->GetProfile(); }

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
        base::BindRepeating(&LeechHandler::EmitTab, weak_factory_.GetWeakPtr()), &guest_);
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
      // The UI opens its first tabs after this answer, so the page script is in by then.
      guest_.Load(UIFolder(), base::BindOnce(
                                  [](base::WeakPtr<LeechHandler> self, base::Value call) {
                                    if (self) self->Reply(call, base::Value(self->BootInfo()));
                                  },
                                  weak_factory_.GetWeakPtr(), call.Clone()));
    } else if (method == "configure") {
      guest_.Configure(arg(0));
      LeechShield(profile(), arg(0));
      LeechSortDownloads(arg(0));
      Reply(call, base::Value());
    } else if (method == "suggest") {
      suggest_.Ask(profile(), text(0), text(1),
                   base::BindOnce([](base::WeakPtr<LeechHandler> self, base::Value call, std::optional<std::string> body) {
                     if (self) self->Reply(call, body ? base::Value(std::move(*body)) : base::Value());
                   }, weak_factory_.GetWeakPtr(), call.Clone()));
    } else if (method == "read") {
      const base::FilePath file = LeechStoreFile(profile()->GetPath(), text(0));
      if (file.empty()) return Reply(call, base::Value());
      LeechStoreRead(file, base::BindOnce(&LeechHandler::Reply, weak_factory_.GetWeakPtr(), call.Clone()));
    } else if (method == "write" || method == "remove") {
      const base::FilePath file = LeechStoreFile(profile()->GetPath(), text(0));
      // ponytail: a private window reads the store but never writes it; its own store when needed.
      if (!file.empty() && !profile()->IsOffTheRecord()) {
        method == "remove" ? LeechStoreRemove(file) : LeechStoreWrite(file, text(1));
      }
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
      view_->SetEscapable(arg(0).GetIfBool().value_or(false), arg(1).GetIfBool().value_or(false));
      Reply(call, base::Value());
    } else if (method == "settings-read") {
      Reply(call, base::Value(LeechSettingsRead(profile())));
    } else if (method == "settings-write") {
      Reply(call, base::Value(LeechSettingsWrite(profile(), text(0), arg(1))));
    } else if (method == "extensions") {
      Reply(call, base::Value(LeechExtensions(profile())));
    } else if (method == "extension-run") {
      view_->RunExtension(text(0), arg(1));
      Reply(call, base::Value());
    } else if (method == "peek-open") {
      view_->OpenPeek(text(0));
      Reply(call, base::Value());
    } else if (method == "peek-close") {
      Reply(call, base::Value(view_->ClosePeek()));
    } else if (method == "stage") {
      view_->SetStage(arg(0));
      Reply(call, base::Value());
    } else if (method == "default-browser") {
      LeechDefaultBrowser(arg(0).GetIfBool().value_or(false),
                          base::BindOnce(
                              [](base::WeakPtr<LeechHandler> self, base::Value call, bool is_default) {
                                if (self) self->Reply(call, base::Value(is_default));
                              },
                              weak_factory_.GetWeakPtr(), call.Clone()));
    } else if (method == "open-page") {
      // Opened like a link to a new tab, so the UI takes it in through "opened".
      chrome::AddTabAt(view_->browser(), GURL(text(0)), -1, true);
      Reply(call, base::Value());
    } else if (method == "sandbox-open") {
      LeechOpenSandbox(profile(), GURL(text(0)));
      Reply(call, base::Value());
    } else if (method == "tab-create") {
      Create(text(0), GURL(text(1)), arg(2).GetIfBool().value_or(false));
      Reply(call, base::Value());
    } else if (method == "tab-show") {
      Show(Find(text(0)));
      Reply(call, base::Value());
    } else if (method == "tab") {
      TabCall(call, Find(text(0)), text(1), arg(2), arg(3));
    } else if (method.starts_with("download")) {
      Reply(call, downloads_ ? downloads_->Call(method, Rest(args)) : base::Value());
    } else if (method == "sandbox-report") {
      LeechSandboxReport(profile(), GURL(text(0)),
                         base::BindOnce(&LeechHandler::Reply, weak_factory_.GetWeakPtr(), call.Clone()));
    } else if (method == "passwords") {
      Passwords(call, text(0), {text(1), text(2), text(3)});
    } else {
      Reply(call, base::Value());
    }
  }

  // A call's arguments after its id and method.
  static base::ListValue Rest(const base::ListValue& args) {
    base::ListValue rest;
    for (size_t i = 2; i < args.size(); i++) rest.Append(args[i].Clone());
    return rest;
  }

  // Made on the first call: loading Chromium's store waits until the panel wants it.
  void Passwords(const base::Value& call, const std::string& what, std::vector<std::string> args) {
    if (!passwords_) {
      auto changed = [](LeechView* view) { view->Emit("passwords", base::ListValue()); };
      passwords_ = std::make_unique<LeechPasswords>(profile(), base::BindRepeating(changed, base::Unretained(view_.get())));
    }
    auto answer = [](base::WeakPtr<LeechHandler> self, base::Value call, base::Value result) {
      if (self) self->Reply(call, std::move(result));
    };
    passwords_->Call(what, std::move(args), base::BindOnce(answer, weak_factory_.GetWeakPtr(), call.Clone()));
  }

  base::DictValue BootInfo() {
    return base::DictValue()
        .Set("version", std::string(version_info::GetVersionNumber()))
        .Set("platform", "linux")
        .Set("private", profile()->IsOffTheRecord())
        .Set("home", base::GetHomeDir().value())
        .Set("downloads", DownloadPrefs::FromBrowserContext(profile())->DownloadPath().value())
        .Set("sandbox", LeechIsSandbox(profile()))
        .Set("page", LeechTakeSandboxPage(profile()));
  }

  // The window must always hold a tab: one blank keeper stays under a blank page in the UI.
  void Boot() {
    if (!observing_) {
      strip()->AddObserver(this);
      observing_ = true;
    }
    if (!downloads_) {
      auto emit = [](LeechView* view, const std::string& name, base::ListValue args) {
        view->Emit(name, std::move(args));
      };
      downloads_ = std::make_unique<LeechDownloadList>(profile(), base::BindRepeating(emit, base::Unretained(view_.get())));
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

  void Window(const std::string& what) {
    views::Widget* widget = view_->GetWidget();
    if (what == "minimize") widget->Minimize();
    else if (what == "maximize") widget->IsMaximized() ? widget->Restore() : widget->Maximize();
    else if (what == "close") widget->Close();
    else if (what == "fullscreen") chrome::ToggleFullscreenMode(view_->browser(), true);
    else if (what == "quit") chrome::AttemptExit();
  }

  // Closing changes the UI's own list first, so the strip's removal isn't reported back as the page's doing.
  void TabCall(const base::Value& call, content::WebContents* contents, const std::string& what,
               const base::Value& a, const base::Value& b) {
    if (!contents) return Reply(call, base::Value());
    if (what == "close") {
      const int index = strip()->GetIndexOfWebContents(contents);
      tabs_.erase(IdOf(contents));
      if (index != TabStripModel::kNoTab) strip()->CloseWebContentsAt(index, TabCloseTypes::CLOSE_USER_GESTURE);
      return Reply(call, base::Value());
    }
    LeechTabCall(view_->browser(), contents, Find(a.is_string() ? a.GetString() : std::string()), what, a, b,
                 base::BindOnce(&LeechHandler::Reply, weak_factory_.GetWeakPtr(), call.Clone()));
  }

  // TabStripModelObserver: tabs Chromium opened itself (links to new tabs, chrome:// pages)
  // become the UI's tabs; tabs closed from inside (window.close) leave it.
  void OnTabStripModelChanged(TabStripModel*, const TabStripModelChange& change,
                              const TabStripSelectionChange& selection) override {
    // A click into a split's other pane activates it here first; the UI follows.
    if (selection.active_tab_changed() && selection.new_contents) {
      const std::string id = IdOf(selection.new_contents);
      if (!id.empty()) EmitTab(id, "activated", base::DictValue());
    }
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

  // Chromium takes a split apart by itself too (a pane closed, dragged away); the UI hears it.
  void OnSplitTabChanged(const SplitTabChange& change) override {
    if (change.type != SplitTabChange::Type::kRemoved) return;
    for (const auto& [tab, index] : change.GetRemovedChange()->tabs()) {
      const std::string id = IdOf(tab->GetContents());
      if (!id.empty()) EmitTab(id, "unsplit", base::DictValue());
    }
  }

  raw_ptr<LeechView> view_;
  bool observing_ = false;
  raw_ptr<content::WebContents> keeper_ = nullptr;
  std::string creating_;
  int opened_ = 0;
  // Before tabs_: every tab's channel reads it until the tab goes.
  GuestScript guest_;
  std::map<std::string, std::unique_ptr<TabWatch>> tabs_;
  LeechSuggest suggest_;
  std::unique_ptr<LeechPasswords> passwords_;
  std::unique_ptr<LeechDownloadList> downloads_;
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
