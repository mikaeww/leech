// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_SANDBOX_LEECH_SANDBOX_H_
#define CHROME_BROWSER_UI_LEECH_SANDBOX_LEECH_SANDBOX_H_

#include <string>

#include "base/time/time.h"

class GURL;
class Profile;

// Sandboxes: a page in a window of its own on a fresh off-the-record profile, so its cookies, storage,
// cache, permissions and extensions are apart from everything else and gone when the window closes.
// Not for: private tabs, which live in the normal window.

// Opens `url` in a new sandbox window.
void LeechOpenSandbox(Profile* from, const GURL& url);

// Whether a window's profile is a sandbox.
bool LeechIsSandbox(Profile* profile);

// The page a sandbox window was opened for, handed out once to its UI as its only tab.
std::string LeechTakeSandboxPage(Profile* profile);

// When a sandbox was made; null for any other profile.
base::Time LeechSandboxMade(Profile* profile);

// A window closed: its sandbox profile goes once no other window holds it.
void LeechSandboxWindowClosed(Profile* profile);

#endif  // CHROME_BROWSER_UI_LEECH_SANDBOX_LEECH_SANDBOX_H_
