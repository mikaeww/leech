// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/services/leech_extensions.h"

#include <algorithm>
#include <vector>

#include "base/functional/callback_helpers.h"
#include "chrome/browser/extensions/extension_action_runner.h"
#include "chrome/browser/extensions/extension_view_host.h"
#include "chrome/browser/extensions/extension_view_host_factory.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/extensions/extension_popup_types.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/views/extensions/extension_popup.h"
#include "components/sessions/content/session_tab_helper.h"
#include "content/public/browser/web_contents.h"
#include "extensions/browser/extension_action.h"
#include "extensions/browser/extension_action_manager.h"
#include "extensions/browser/extension_registry.h"
#include "extensions/common/extension.h"
#include "extensions/common/manifest.h"
#include "ui/gfx/geometry/point.h"
#include "ui/gfx/geometry/size.h"
#include "ui/views/bubble/bubble_anchor.h"
#include "ui/views/bubble/bubble_border.h"
#include "ui/views/view.h"

namespace {

// The popup opens toward the window's middle: up from the sidebar's foot, down and left from the strip's end.
// Below a door at the foot it would land outside the window, where Wayland and X11 both cut it off.
views::BubbleBorder::Arrow ArrowToward(const views::View* anchor) {
  const gfx::Point at = anchor->bounds().CenterPoint();
  const gfx::Size room = anchor->parent()->size();
  const bool right = at.x() > room.width() / 2;
  if (at.y() > room.height() / 2) {
    return right ? views::BubbleBorder::BOTTOM_RIGHT : views::BubbleBorder::BOTTOM_LEFT;
  }
  return right ? views::BubbleBorder::TOP_RIGHT : views::BubbleBorder::TOP_LEFT;
}

}  // namespace

base::ListValue LeechExtensions(Profile* profile) {
  auto* actions = extensions::ExtensionActionManager::Get(profile);
  std::vector<const extensions::Extension*> found;
  for (const auto& extension : extensions::ExtensionRegistry::Get(profile)->enabled_extensions()) {
    if (!extensions::Manifest::IsComponentLocation(extension->location()) &&
        actions->GetExtensionAction(*extension)) {
      found.push_back(extension.get());
    }
  }
  std::ranges::sort(found, {}, &extensions::Extension::name);
  base::ListValue list;
  for (const extensions::Extension* extension : found) {
    list.Append(base::DictValue().Set("id", extension->id()).Set("name", extension->name()));
  }
  return list;
}

void LeechRunExtension(BrowserWindowInterface* browser, views::View* anchor, const std::string& id) {
  Profile* profile = browser->GetProfile();
  const extensions::Extension* extension =
      extensions::ExtensionRegistry::Get(profile)->enabled_extensions().GetByID(id);
  content::WebContents* contents = browser->GetTabStripModel()->GetActiveWebContents();
  auto* runner = contents ? extensions::ExtensionActionRunner::GetForWebContents(contents) : nullptr;
  if (!extension || !runner) {
    return;
  }
  // An action without a popup has run already (onClicked); one with a popup is shown here.
  if (runner->RunAction(extension, /*grant_tab_permissions=*/true) !=
      extensions::ExtensionAction::ShowAction::kShowPopup) {
    return;
  }
  extensions::ExtensionAction* action =
      extensions::ExtensionActionManager::Get(profile)->GetExtensionAction(*extension);
  const GURL url = action->GetPopupUrl(sessions::SessionTabHelper::IdForTab(contents).id());
  ExtensionPopup::ShowPopup(browser,
                            extensions::ExtensionViewHostFactory::CreatePopupHost(*extension, url, browser),
                            views::BubbleAnchor(anchor), ArrowToward(anchor), PopupShowAction::kShow,
                            base::DoNothing());
}
