// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_SERVICES_LEECH_EXTENSIONS_H_
#define CHROME_BROWSER_UI_LEECH_SERVICES_LEECH_EXTENSIONS_H_

#include <string>

#include "base/values.h"

class BrowserWindowInterface;
class Profile;

namespace views {
class View;
}

// Extensions for the UI, whose window has no toolbar of Chromium's: the installed extensions with a toolbar
// action, and running one the way its toolbar button would.

// [{id, name}] of the enabled extensions that have an action, by name; built-in ones are left out.
base::ListValue LeechExtensions(Profile* profile);

// Runs the action on the tab on screen; a popup hangs from `anchor`, which stands where the UI's door is.
void LeechRunExtension(BrowserWindowInterface* browser, views::View* anchor, const std::string& id);

#endif  // CHROME_BROWSER_UI_LEECH_SERVICES_LEECH_EXTENSIONS_H_
