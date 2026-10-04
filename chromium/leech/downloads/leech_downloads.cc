// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/downloads/leech_downloads.h"

#include <string>

#include "base/no_destructor.h"
#include "base/strings/string_util.h"
#include "third_party/re2/src/re2/re2.h"

namespace {

// ponytail: one table for the whole browser, as every window's UI sends the same one; per profile if a
// sandbox ever sorts differently.
base::Value& Table() {
  static base::NoDestructor<base::Value> table;
  return *table;
}

// The folder whose extensions hold `ext`; a pair that isn't [name, [extensions]] is passed over.
std::string FolderHolding(const base::ListValue& kinds, const std::string& ext) {
  for (const base::Value& kind : kinds) {
    const base::ListValue* pair = kind.GetIfList();
    if (!pair || pair->size() != 2 || !(*pair)[0].is_string() || !(*pair)[1].is_list()) {
      continue;
    }
    for (const base::Value& known : (*pair)[1].GetList()) {
      if (known.is_string() && known.GetString() == ext) {
        return (*pair)[0].GetString();
      }
    }
  }
  return std::string();
}

std::string KindOf(const base::DictValue& sort, const std::string& ext) {
  const base::ListValue* kinds = sort.FindList("kinds");
  std::string folder = kinds && !ext.empty() ? FolderHolding(*kinds, ext) : std::string();
  const std::string* other = sort.FindString("other");
  return !folder.empty() || !other ? folder : *other;
}

}  // namespace

void LeechSortDownloads(const base::Value& config) {
  const base::DictValue* dict = config.GetIfDict();
  const base::Value* sort = dict ? dict->Find("sort") : nullptr;
  Table() = sort && sort->is_dict() ? sort->Clone() : base::Value();
}

base::FilePath LeechDownloadFolder(const base::FilePath& name) {
  const base::DictValue* sort = Table().GetIfDict();
  if (!sort) {
    return base::FilePath();
  }
  const std::string ext = base::ToLowerASCII(name.FinalExtension());
  const std::string folder = KindOf(*sort, ext.empty() ? ext : ext.substr(1));
  // The table comes from the UI's page: a folder is one plain word, never a way out of the downloads folder.
  return RE2::FullMatch(folder, "[A-Za-z0-9]+") ? base::FilePath(folder) : base::FilePath();
}
