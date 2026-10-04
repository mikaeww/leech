// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/files/leech_folder.h"

#include <optional>
#include <set>
#include <utility>

#include "base/files/file_enumerator.h"
#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/no_destructor.h"
#include "base/strings/string_util.h"
#include "base/task/thread_pool.h"
#include "chrome/browser/ui/select_file_policy/chrome_select_file_policy.h"
#include "content/public/browser/web_contents.h"
#include "ui/shell_dialogs/select_file_dialog.h"
#include "ui/shell_dialogs/selected_file_info.h"

namespace {

// The editor holds text; anything bigger is a build artefact or data, not something to edit here.
constexpr int64_t kLargestText = 2 << 20;
constexpr size_t kMostEntries = 5000;

// The folders the owner chose since the browser started; the UI's page can't name any other as a root.
std::set<std::string>& Chosen() {
  static base::NoDestructor<std::set<std::string>> chosen;
  return *chosen;
}

// Asks once, answers once, then goes.
class FolderChooser : public ui::SelectFileDialog::Listener {
 public:
  FolderChooser(content::WebContents* contents, const base::FilePath& start, LeechFolderDone done)
      : done_(std::move(done)) {
    dialog_ = ui::SelectFileDialog::Create(this, std::make_unique<ChromeSelectFilePolicy>(contents));
    dialog_->SelectFile(ui::SelectFileDialog::SELECT_FOLDER, u"Open a folder", start, nullptr, 0,
                        FILE_PATH_LITERAL(""), contents->GetTopLevelNativeWindow());
  }
  ~FolderChooser() override { dialog_->ListenerDestroyed(); }

  void FileSelected(const ui::SelectedFileInfo& file, int) override {
    Chosen().insert(file.path().value());
    Answer(file.path().value());
  }
  void FileSelectionCanceled() override { Answer(std::string()); }

 private:
  void Answer(std::string path) {
    std::move(done_).Run(base::Value(std::move(path)));
    delete this;
  }

  LeechFolderDone done_;
  scoped_refptr<ui::SelectFileDialog> dialog_;
};

// `rel` under `root` with links resolved, or nothing when it would lead out of the root. A file that doesn't
// exist yet is checked by its folder.
std::optional<base::FilePath> Inside(const std::string& root, const std::string& rel) {
  const base::FilePath base(root);
  const base::FilePath part(rel);
  if (!base.IsAbsolute() || part.IsAbsolute() || part.ReferencesParent()) return std::nullopt;
  const base::FilePath real_root = base::MakeAbsoluteFilePath(base);
  const base::FilePath full = rel.empty() ? base : base.Append(part);
  base::FilePath real = base::MakeAbsoluteFilePath(full);
  if (real.empty()) {
    const base::FilePath folder = base::MakeAbsoluteFilePath(full.DirName());
    if (folder.empty()) return std::nullopt;
    real = folder.Append(full.BaseName());
  }
  if (real_root.empty() || !(real == real_root || real_root.IsParent(real))) return std::nullopt;
  return real;
}

base::Value Failure(const std::string& error) {
  return base::Value(base::DictValue().Set("error", error));
}

base::Value List(const base::FilePath& dir) {
  base::ListValue entries;
  base::FileEnumerator walk(dir, false, base::FileEnumerator::FILES | base::FileEnumerator::DIRECTORIES);
  for (base::FilePath path = walk.Next(); !path.empty() && entries.size() < kMostEntries; path = walk.Next()) {
    const base::FileEnumerator::FileInfo info = walk.GetInfo();
    entries.Append(base::DictValue()
                       .Set("name", path.BaseName().value())
                       .Set("dir", info.IsDirectory())
                       .Set("size", static_cast<double>(info.GetSize())));
  }
  return base::Value(std::move(entries));
}

base::Value Read(const base::FilePath& file) {
  std::optional<int64_t> size = base::GetFileSize(file);
  if (!size) return Failure("It can't be read.");
  if (*size > kLargestText) return Failure("It is larger than 2 MB.");
  std::string text;
  if (!base::ReadFileToString(file, &text)) return Failure("It can't be read.");
  if (!base::IsStringUTF8(text)) return Failure("It isn't text.");
  return base::Value(base::DictValue().Set("text", std::move(text)));
}

base::Value Write(const base::FilePath& file, const std::string& text) {
  if (!base::ImportantFileWriter::WriteFileAtomically(file, text)) return Failure("It couldn't be saved.");
  return base::Value(base::DictValue().Set("ok", true));
}

}  // namespace

void LeechChooseFolder(content::WebContents* contents, const std::string& start, LeechFolderDone done) {
  // Without a folder to start from, home: GTK's own start, its recent files, holds no folder to choose.
  const base::FilePath folder(start);
  new FolderChooser(contents, folder.IsAbsolute() ? folder : base::GetHomeDir(), std::move(done));
}

void LeechFolderCall(const std::string& method, const base::ListValue& args, LeechFolderDone done) {
  auto text = [&](size_t i) { return i < args.size() && args[i].is_string() ? args[i].GetString() : std::string(); };
  if (!Chosen().contains(text(0))) {
    std::move(done).Run(Failure("not-chosen"));
    return;
  }
  // Resolving links touches the disk, so even the check runs off the UI thread.
  auto work = [](std::string method, std::string root, std::string rel, std::string body) {
    std::optional<base::FilePath> path = Inside(root, rel);
    if (!path) return Failure("That is outside the folder.");
    if (method == "folder-list") return List(*path);
    if (method == "folder-read") return Read(*path);
    if (method == "folder-write") return Write(*path, body);
    return Failure("Leech doesn't know that.");
  };
  base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()},
                                               base::BindOnce(work, method, text(0), text(1), text(2)),
                                               std::move(done));
}
