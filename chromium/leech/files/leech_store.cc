// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/files/leech_store.h"

#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/no_destructor.h"
#include "base/task/sequenced_task_runner.h"
#include "base/task/thread_pool.h"
#include "third_party/re2/src/re2/re2.h"

namespace {

// One sequence for every write, so a later write of a file never lands before an earlier one.
scoped_refptr<base::SequencedTaskRunner> Writer() {
  static base::NoDestructor<scoped_refptr<base::SequencedTaskRunner>> writer(
      base::ThreadPool::CreateSequencedTaskRunner(
          {base::MayBlock(), base::TaskShutdownBehavior::BLOCK_SHUTDOWN}));
  return *writer;
}

}  // namespace

base::FilePath LeechStoreFile(const base::FilePath& profile_dir, const std::string& name) {
  if (!RE2::FullMatch(name, "[a-z0-9-]+")) {
    return base::FilePath();
  }
  return profile_dir.AppendASCII("Leech").AppendASCII(name + ".json");
}

void LeechStoreRead(const base::FilePath& file, base::OnceCallback<void(base::Value)> done) {
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock()},
      base::BindOnce(
          [](base::FilePath file) {
            std::string json;
            return base::ReadFileToString(file, &json) ? base::Value(json) : base::Value();
          },
          file),
      std::move(done));
}

void LeechStoreWrite(const base::FilePath& file, std::string json) {
  Writer()->PostTask(FROM_HERE, base::BindOnce(
                                    [](base::FilePath file, std::string json) {
                                      base::CreateDirectory(file.DirName());
                                      base::ImportantFileWriter::WriteFileAtomically(file, json);
                                    },
                                    file, std::move(json)));
}

void LeechStoreRemove(const base::FilePath& file) {
  Writer()->PostTask(FROM_HERE, base::BindOnce(base::IgnoreResult(&base::DeleteFile), file));
}
