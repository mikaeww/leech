// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_FILES_LEECH_STORE_H_
#define CHROME_BROWSER_UI_LEECH_FILES_LEECH_STORE_H_

#include <string>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/values.h"

// Leech's JSON files in the profile's Leech/ folder (settings, session, history, ...), read and written off
// the UI thread. Not for: anything outside that folder.

// The file for a store name; empty for a name that isn't lowercase letters, digits and dashes.
base::FilePath LeechStoreFile(const base::FilePath& profile_dir, const std::string& name);

// `done` gets the file's text, or none when it can't be read.
void LeechStoreRead(const base::FilePath& file, base::OnceCallback<void(base::Value)> done);

// Writes atomically (temp + rename), or removes the file; in order, finished before the browser exits.
void LeechStoreWrite(const base::FilePath& file, std::string json);
void LeechStoreRemove(const base::FilePath& file);

#endif  // CHROME_BROWSER_UI_LEECH_FILES_LEECH_STORE_H_
