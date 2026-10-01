// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_SERVICES_LEECH_SPLIT_H_
#define CHROME_BROWSER_UI_LEECH_SERVICES_LEECH_SPLIT_H_

class TabStripModel;

namespace content {
class WebContents;
}

// Split view for the UI: Chromium's own side by side, which lays out and resizes the two pages itself.
// `left` becomes the left pane. Either tab leaves any split it was in first.
void LeechSplit(TabStripModel* strip, content::WebContents* left, content::WebContents* right);

// Takes apart the split the tab is in; nothing when it is in none.
void LeechUnsplit(TabStripModel* strip, content::WebContents* contents);

#endif  // CHROME_BROWSER_UI_LEECH_SERVICES_LEECH_SPLIT_H_
