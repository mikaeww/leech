// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_PAGE_LEECH_SLEEP_H_
#define CHROME_BROWSER_UI_LEECH_PAGE_LEECH_SLEEP_H_

namespace content {
class WebContents;
}

// A sleeping tab: Chromium's discard, as chrome.tabs.discard does it. The renderer goes, the tab and its back and
// forward stay; the UI's element for it is let go until the tab is chosen again.

// True when the tab was discarded; false when Chromium refused (already discarded, not in the strip).
bool LeechSleep(content::WebContents* contents);

// Loads a discarded tab again from where it was, history and all; a live page is left alone.
void LeechWake(content::WebContents* contents);

#endif  // CHROME_BROWSER_UI_LEECH_PAGE_LEECH_SLEEP_H_
