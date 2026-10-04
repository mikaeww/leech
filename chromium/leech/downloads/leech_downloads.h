// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_DOWNLOADS_LEECH_DOWNLOADS_H_
#define CHROME_BROWSER_UI_LEECH_DOWNLOADS_LEECH_DOWNLOADS_H_

#include "base/files/file_path.h"
#include "base/values.h"

// Downloads sorted into a folder of their kind under the downloads folder (Settings › Downloads), with the
// UI's table (ui/places/sorting/kinds.js). Not for: where the downloads folder is, which stays Chromium's.

// From the UI's configure: its "sort" is {kinds: [[folder, [extensions]]...], other} or null for off.
void LeechSortDownloads(const base::Value& config);

// The folder for a file name, one plain path part; empty while sorting is off.
base::FilePath LeechDownloadFolder(const base::FilePath& name);

#endif  // CHROME_BROWSER_UI_LEECH_DOWNLOADS_LEECH_DOWNLOADS_H_
