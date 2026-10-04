// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_TABS_LEECH_TAB_CALL_H_
#define CHROME_BROWSER_UI_LEECH_TABS_LEECH_TAB_CALL_H_

#include <string>

#include "base/functional/callback.h"
#include "base/values.h"

class BrowserWindowInterface;

namespace content {
class WebContents;
}

// What the UI asks of one of its tabs ("tab" calls: load, reload, back, zoom, find, split, sleep, script, ...).
// Not for: opening, showing and closing tabs, which change the UI's own bookkeeping (leech_ui.cc).

// `other` is the tab a split pairs it with; `done` gets the answer, null for most.
void LeechTabCall(BrowserWindowInterface* browser, content::WebContents* contents, content::WebContents* other,
                  const std::string& what, const base::Value& a, const base::Value& b,
                  base::OnceCallback<void(base::Value)> done);

#endif  // CHROME_BROWSER_UI_LEECH_TABS_LEECH_TAB_CALL_H_
