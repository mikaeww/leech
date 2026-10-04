// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_SANDBOX_LEECH_SANDBOX_REPORT_H_
#define CHROME_BROWSER_UI_LEECH_SANDBOX_LEECH_SANDBOX_REPORT_H_

#include "base/functional/callback.h"
#include "base/values.h"

class GURL;
class Profile;

// What the sandbox panel shows as proof that a sandbox is apart: everything the sandbox holds, site by site,
// and the cookies the page on screen has here against the ones it has in the owner's normal profile.
// Not for: making or closing sandboxes (leech_sandbox.h).

// `done` gets {made, sites: [{site, cookies, size, kinds}], here: {host, sandbox, normal}}, where sandbox and
// normal are the names of the page's cookies on each side (never their values); `here` is null when `page`
// isn't a web page.
void LeechSandboxReport(Profile* sandbox, const GURL& page, base::OnceCallback<void(base::Value)> done);

#endif  // CHROME_BROWSER_UI_LEECH_SANDBOX_LEECH_SANDBOX_REPORT_H_
