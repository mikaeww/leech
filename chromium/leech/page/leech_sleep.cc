// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/page/leech_sleep.h"

#include "base/logging.h"
#include "chrome/browser/resource_coordinator/lifecycle_unit_state.mojom.h"
#include "chrome/browser/resource_coordinator/tab_lifecycle_unit_external.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"

bool LeechSleep(content::WebContents* contents) {
  auto* unit = resource_coordinator::TabLifecycleUnitExternal::FromWebContents(contents);
  if (!unit) {
    LOG(WARNING) << "Leech: a tab without a lifecycle unit can't sleep";
    return false;
  }
  // Replaces the tab's WebContents with an empty one holding the same history; TabWatch follows the swap.
  return unit->DiscardTab(::mojom::LifecycleUnitDiscardReason::EXTERNAL);
}

void LeechWake(content::WebContents* contents) {
  // Chromium reloads a discarded tab once it is active in a focused window; the UI asks when it shows the tab,
  // focused or not. A tab whose page lives (or is loading for the first time) isn't discarded.
  if (!contents->WasDiscarded() || contents->GetPrimaryMainFrame()->IsRenderFrameLive()) {
    return;
  }
  content::NavigationController& nav = contents->GetController();
  nav.SetNeedsReload();
  nav.LoadIfNecessary();
}
