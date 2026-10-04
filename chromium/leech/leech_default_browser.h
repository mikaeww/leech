// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_LEECH_DEFAULT_BROWSER_H_
#define CHROME_BROWSER_UI_LEECH_LEECH_DEFAULT_BROWSER_H_

#include "base/functional/callback.h"

// Whether Leech is the desktop's default browser, or making it so. The desktop file is the one
// $CHROME_DESKTOP names (the launcher sets it). `done` gets whether Leech is the default afterwards.
void LeechDefaultBrowser(bool make, base::OnceCallback<void(bool)> done);

#endif  // CHROME_BROWSER_UI_LEECH_LEECH_DEFAULT_BROWSER_H_
