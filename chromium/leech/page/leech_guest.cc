// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/page/leech_guest.h"

#include <utility>

#include "base/files/file_util.h"
#include "base/json/json_writer.h"
#include "base/logging.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/thread_pool.h"
#include "chrome/common/chrome_isolated_world_ids.h"
#include "content/public/browser/render_frame_host.h"

namespace {

struct Files {
  std::string chromium;
  std::string page;
};

Files ReadFiles(const base::FilePath& folder) {
  Files files;
  for (auto [name, text] : {std::pair{"chromium.js", &files.chromium}, std::pair{"page.js", &files.page}}) {
    if (!base::ReadFileToString(folder.AppendASCII("guest").AppendASCII(name), text)) {
      LOG(ERROR) << "Leech: no page script at " << folder.AppendASCII("guest").AppendASCII(name);
    }
  }
  return files;
}

}  // namespace

GuestScript::GuestScript() = default;
GuestScript::~GuestScript() = default;

void GuestScript::Load(const base::FilePath& ui_folder, base::OnceClosure done) {
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock()}, base::BindOnce(&ReadFiles, ui_folder),
      base::BindOnce(
          [](base::WeakPtr<GuestScript> self, base::OnceClosure done, Files files) {
            if (self) {
              self->chromium_ = std::move(files.chromium);
              self->page_ = std::move(files.page);
            }
            std::move(done).Run();
          },
          weak_factory_.GetWeakPtr(), std::move(done)));
}

void GuestScript::Configure(const base::Value& config) {
  config_ = base::WriteJson(config).value_or("{}");
}

std::u16string GuestScript::Source() const {
  if (chromium_.empty() || page_.empty()) {
    return std::u16string();
  }
  // Once per document: a page back from the back-forward cache still has its script.
  return base::UTF8ToUTF16("(() => {\nif (globalThis.leechHost) return\nconst config = " + config_ + "\n" +
                           chromium_ + "\n" + page_ + "\n})()");
}

GuestChannel::GuestChannel(const GuestScript* script, Heard heard)
    : script_(script), heard_(std::move(heard)) {}

GuestChannel::~GuestChannel() = default;

void GuestChannel::Start(content::RenderFrameHost* frame) {
  ++document_;
  frame_ = frame->GetGlobalId();
  const std::u16string source = script_->Source();
  if (source.empty()) {
    return;
  }
  frame->ExecuteJavaScriptInIsolatedWorld(source, {}, ISOLATED_WORLD_ID_CHROME_INTERNAL);
  Ask();
}

void GuestChannel::Ask() {
  content::RenderFrameHost* frame = content::RenderFrameHost::FromID(frame_);
  if (!frame || !frame->IsRenderFrameLive()) {
    return;
  }
  // Blink awaits the promise (the one line Leech changes in local_frame_mojo_handler.cc).
  frame->ExecuteJavaScriptInIsolatedWorld(
      u"globalThis.leechHost?.next()",
      base::BindOnce(&GuestChannel::Took, weak_factory_.GetWeakPtr(), document_),
      ISOLATED_WORLD_ID_CHROME_INTERNAL);
}

void GuestChannel::Took(int document, base::Value messages) {
  // Not a list: the page went away, or never got its script. Its next document starts again.
  if (document != document_ || !messages.is_list()) {
    return;
  }
  for (base::Value& message : messages.GetList()) {
    base::ListValue* pair = message.GetIfList();
    if (!pair || pair->size() != 2 || !(*pair)[0].is_string() || !(*pair)[1].is_list()) {
      LOG(WARNING) << "Leech: a page script message without [channel, args]";
      continue;
    }
    heard_.Run((*pair)[0].GetString(), std::move((*pair)[1]));
  }
  Ask();
}
