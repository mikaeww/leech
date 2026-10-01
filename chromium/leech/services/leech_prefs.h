// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_SERVICES_LEECH_PREFS_H_
#define CHROME_BROWSER_UI_LEECH_SERVICES_LEECH_PREFS_H_

#include <string>

#include "base/values.h"

class Profile;

// Chromium's settings for the UI's settings panel, through a fixed list (ADR 0004): each entry is a profile
// pref, a local-state pref or a site permission's default, with its type and the values it may take.

// Every entry's current value, by the UI's name for it.
base::DictValue LeechSettingsRead(Profile* profile);

// Sets one entry. False, and nothing changes, for a name not on the list, a read-only entry, a wrong type or a
// value the entry doesn't allow.
bool LeechSettingsWrite(Profile* profile, const std::string& name, const base::Value& value);

#endif  // CHROME_BROWSER_UI_LEECH_SERVICES_LEECH_PREFS_H_
