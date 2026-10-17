// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_PAGE_LEECH_SHIELD_H_
#define CHROME_BROWSER_UI_LEECH_PAGE_LEECH_SHIELD_H_

#include "base/callback_list.h"
#include "base/functional/callback.h"
#include "base/values.h"

class GURL;
class Profile;

namespace content {
class NavigationThrottleRegistry;
class RenderFrameHost;
class WebContents;
}

// The id of the shield's component extension; Chromium's component allowlist names it (leech.patch).
inline constexpr char kLeechShieldId[] = "npmnhgjkapcfndfdgmhmjfifkaandman";

// The shield in the Chromium build: from the UI's L.configure ({shield, paused, blocked}), the hosts in `blocked`
// are blocked when another site loads them, except on paused sites, as declarativeNetRequest's dynamic rules of
// a component extension that has nothing else (ADR 0006). Hiding the boxes they leave is the page script's.
void LeechShield(Profile* profile, const base::Value& config);

// Whether the page of `initiator` may not open `target`: the tab it is in shows a guarded site or one under it
// (`guarded` in the config, with the shield on and the site not paused) and `target` is another site. When it
// may not, LeechOnGuarded's listeners hear of it. Chromium asks before a page opens a window
// (chrome_content_browser_client.cc, guard.patch) and before a page navigates a tab (the throttle below).
bool LeechGuards(content::RenderFrameHost* initiator, const GURL& target);

// `heard` is called with the tab and the address each time the guard keeps a page from leaving, for as long as
// the subscription lives.
base::CallbackListSubscription LeechOnGuarded(base::RepeatingCallback<void(content::WebContents*, const GURL&)> heard);

// Adds the throttle that cancels a page's navigation of a tab when LeechGuards says so; typed addresses, the
// UI's own loads and history aren't the page's and pass.
void LeechGuardNavigation(content::NavigationThrottleRegistry& registry);

#endif  // CHROME_BROWSER_UI_LEECH_PAGE_LEECH_SHIELD_H_
