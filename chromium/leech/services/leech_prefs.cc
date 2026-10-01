// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/services/leech_prefs.h"

#include <algorithm>
#include <initializer_list>
#include <string_view>
#include <vector>

#include "base/files/file_path.h"
#include "base/logging.h"
#include "base/no_destructor.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/content_settings/host_content_settings_map_factory.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/common/pref_names.h"
#include "components/autofill/core/common/autofill_prefs.h"
#include "components/content_settings/core/browser/host_content_settings_map.h"
#include "components/content_settings/core/common/content_settings.h"
#include "components/content_settings/core/common/content_settings_types.h"
#include "components/content_settings/core/common/pref_names.h"
#include "components/password_manager/core/common/password_manager_pref_names.h"
#include "components/prefs/pref_service.h"
#include "components/safe_browsing/core/common/safe_browsing_prefs.h"
#include "components/spellcheck/browser/pref_names.h"
#include "components/translate/core/browser/translate_pref_names.h"

namespace {

enum class Kind { kBool, kChoice, kSite, kPath };

struct Entry {
  std::string_view name;
  Kind kind;
  // The pref's name for prefs, empty for a site permission.
  std::string_view pref;
  // Local state instead of the profile (settings for the whole browser, such as the GPU).
  bool local = false;
  ContentSettingsType site = ContentSettingsType::DEFAULT;
  // The values a choice or a site permission may take; a site's are ContentSetting numbers.
  std::vector<int> allowed = {};
};

const std::vector<Entry>& Entries() {
  static const base::NoDestructor<std::vector<Entry>> entries({
      {"cookies", Kind::kChoice, prefs::kCookieControlsMode, false, ContentSettingsType::DEFAULT, {1, 2}},
      {"do-not-track", Kind::kBool, prefs::kEnableDoNotTrack},
      {"safe-browsing", Kind::kBool, prefs::kSafeBrowsingEnabled},
      {"safe-browsing-enhanced", Kind::kBool, prefs::kSafeBrowsingEnhanced},
      {"https-only", Kind::kBool, prefs::kHttpsOnlyModeEnabled},
      // 0 standard preloading, 2 none (preloading_prefs.h).
      {"preload", Kind::kChoice, prefs::kNetworkPredictionOptions, false, ContentSettingsType::DEFAULT, {0, 2}},
      {"spellcheck", Kind::kBool, spellcheck::prefs::kSpellCheckEnable},
      {"translate", Kind::kBool, translate::prefs::kOfferTranslateEnabled},
      {"autofill-addresses", Kind::kBool, autofill::prefs::kAutofillProfileEnabled},
      {"autofill-cards", Kind::kBool, autofill::prefs::kAutofillCreditCardEnabled},
      {"passwords-save", Kind::kBool, password_manager::prefs::kCredentialsEnableService},
      {"passwords-autosignin", Kind::kBool, password_manager::prefs::kCredentialsEnableAutosignin},
      {"downloads-ask", Kind::kBool, prefs::kPromptForDownload},
      {"downloads-folder", Kind::kPath, prefs::kDownloadDefaultDirectory},
      {"font-size", Kind::kChoice, prefs::kWebKitDefaultFontSize, false, ContentSettingsType::DEFAULT, {9, 12, 16, 20, 24}},
      {"hardware-acceleration", Kind::kBool, prefs::kHardwareAccelerationModeEnabled, true},
      {"site-location", Kind::kSite, "", false, ContentSettingsType::GEOLOCATION, {CONTENT_SETTING_ASK, CONTENT_SETTING_BLOCK}},
      {"site-camera", Kind::kSite, "", false, ContentSettingsType::MEDIASTREAM_CAMERA, {CONTENT_SETTING_ASK, CONTENT_SETTING_BLOCK}},
      {"site-microphone", Kind::kSite, "", false, ContentSettingsType::MEDIASTREAM_MIC, {CONTENT_SETTING_ASK, CONTENT_SETTING_BLOCK}},
      {"site-notifications", Kind::kSite, "", false, ContentSettingsType::NOTIFICATIONS, {CONTENT_SETTING_ASK, CONTENT_SETTING_BLOCK}},
      {"site-clipboard", Kind::kSite, "", false, ContentSettingsType::CLIPBOARD_READ_WRITE, {CONTENT_SETTING_ASK, CONTENT_SETTING_BLOCK}},
      {"site-popups", Kind::kSite, "", false, ContentSettingsType::POPUPS, {CONTENT_SETTING_ALLOW, CONTENT_SETTING_BLOCK}},
      {"site-javascript", Kind::kSite, "", false, ContentSettingsType::JAVASCRIPT, {CONTENT_SETTING_ALLOW, CONTENT_SETTING_BLOCK}},
      {"site-images", Kind::kSite, "", false, ContentSettingsType::IMAGES, {CONTENT_SETTING_ALLOW, CONTENT_SETTING_BLOCK}},
      {"site-sound", Kind::kSite, "", false, ContentSettingsType::SOUND, {CONTENT_SETTING_ALLOW, CONTENT_SETTING_BLOCK}},
  });
  return *entries;
}

PrefService* StoreOf(Profile* profile, const Entry& entry) {
  return entry.local ? g_browser_process->local_state() : profile->GetPrefs();
}

base::Value Read(Profile* profile, const Entry& entry) {
  if (entry.kind == Kind::kSite) {
    return base::Value(static_cast<int>(
        HostContentSettingsMapFactory::GetForProfile(profile)->GetDefaultContentSetting(entry.site)));
  }
  PrefService* store = StoreOf(profile, entry);
  switch (entry.kind) {
    case Kind::kBool:
      return base::Value(store->GetBoolean(entry.pref));
    case Kind::kChoice:
      return base::Value(store->GetInteger(entry.pref));
    case Kind::kPath:
      return base::Value(store->GetFilePath(entry.pref).AsUTF8Unsafe());
    case Kind::kSite:
      break;
  }
  return base::Value();
}

bool Allowed(const Entry& entry, int value) {
  return std::ranges::find(entry.allowed, value) != entry.allowed.end();
}

}  // namespace

base::DictValue LeechSettingsRead(Profile* profile) {
  base::DictValue values;
  for (const Entry& entry : Entries()) {
    values.Set(entry.name, Read(profile, entry));
  }
  return values;
}

bool LeechSettingsWrite(Profile* profile, const std::string& name, const base::Value& value) {
  auto it = std::ranges::find(Entries(), name, &Entry::name);
  const bool known = it != Entries().end();
  const bool fits = known && ((it->kind == Kind::kBool && value.is_bool()) ||
                              (it->kind == Kind::kChoice && value.is_int() && Allowed(*it, value.GetInt())) ||
                              (it->kind == Kind::kSite && value.is_int() && Allowed(*it, value.GetInt())));
  if (!fits) {
    LOG(WARNING) << "leech: refused to set Chromium setting \"" << name << "\" to " << value.DebugString();
    return false;
  }
  if (it->kind == Kind::kSite) {
    HostContentSettingsMapFactory::GetForProfile(profile)->SetDefaultContentSetting(
        it->site, static_cast<ContentSetting>(value.GetInt()));
  } else if (it->kind == Kind::kBool) {
    StoreOf(profile, *it)->SetBoolean(it->pref, value.GetBool());
  } else {
    StoreOf(profile, *it)->SetInteger(it->pref, value.GetInt());
  }
  return true;
}
