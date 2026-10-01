// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/services/leech_split.h"

#include "chrome/browser/ui/tabs/split_tab_metrics.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/split_tabs/split_tab_visual_data.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/web_contents.h"

void LeechUnsplit(TabStripModel* strip, content::WebContents* contents) {
  const int index = contents ? strip->GetIndexOfWebContents(contents) : TabStripModel::kNoTab;
  if (index == TabStripModel::kNoTab) {
    return;
  }
  if (std::optional<split_tabs::SplitTabId> split = strip->GetSplitForTab(index)) {
    strip->RemoveSplit(*split);
  }
}

void LeechSplit(TabStripModel* strip, content::WebContents* left, content::WebContents* right) {
  if (!left || !right || left == right) {
    return;
  }
  LeechUnsplit(strip, left);
  LeechUnsplit(strip, right);
  const int a = strip->GetIndexOfWebContents(left);
  const int b = strip->GetIndexOfWebContents(right);
  if (a == TabStripModel::kNoTab || b == TabStripModel::kNoTab) {
    return;
  }
  const split_tabs::SplitTabId split = strip->AddToNewSplit(
      {a, b}, split_tabs::SplitTabVisualData(split_tabs::SplitTabLayout::kSideBySide, 0.5),
      split_tabs::SplitTabCreatedSource::kTabContextMenu);
  // Chromium orders a split's panes by the tab strip; the UI's row decides here.
  if (strip->GetIndexOfWebContents(left) > strip->GetIndexOfWebContents(right)) {
    strip->ReverseTabsInSplit(split);
  }
}
