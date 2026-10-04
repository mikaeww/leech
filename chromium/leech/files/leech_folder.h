// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_FILES_LEECH_FOLDER_H_
#define CHROME_BROWSER_UI_LEECH_FILES_LEECH_FOLDER_H_

#include <string>

#include "base/functional/callback.h"
#include "base/values.h"

namespace content {
class WebContents;
}

// The Dev UI's Explorer: a folder the owner chose in Chromium's chooser since the browser started, listed, read
// and written, never anything outside it (no "..", no absolute path, no symlink leading out). Not for: Leech's
// own files (files/leech_store.h).

using LeechFolderDone = base::OnceCallback<void(base::Value)>;

// Chromium's folder chooser over `contents`' window, opening at `start` when it is a path, else at home; `done` gets the
// folder's path, or "" when none is chosen.
void LeechChooseFolder(content::WebContents* contents, const std::string& start, LeechFolderDone done);

// A "folder-*" call: list (root, rel) answers [{name, dir, size}], read (root, rel) {text} or {error},
// write (root, rel, text) {ok} or {error}. A root not chosen since the browser started answers
// {error: "not-chosen"}.
void LeechFolderCall(const std::string& method, const base::ListValue& args, LeechFolderDone done);

#endif  // CHROME_BROWSER_UI_LEECH_FILES_LEECH_FOLDER_H_
