// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_PAGE_LEECH_SHIELD_H_
#define CHROME_BROWSER_UI_LEECH_PAGE_LEECH_SHIELD_H_

#include "base/values.h"

class Profile;

// The id of the shield's component extension; Chromium's component allowlist names it (leech.patch).
inline constexpr char kLeechShieldId[] = "npmnhgjkapcfndfdgmhmjfifkaandman";

// The shield in the Chromium build: from the UI's L.configure ({shield, paused, blocked}), the hosts in `blocked`
// are blocked when another site loads them, except on paused sites, as declarativeNetRequest's dynamic rules of
// a component extension that has nothing else (ADR 0006). Hiding the boxes they leave is the page script's.
void LeechShield(Profile* profile, const base::Value& config);

#endif  // CHROME_BROWSER_UI_LEECH_PAGE_LEECH_SHIELD_H_
