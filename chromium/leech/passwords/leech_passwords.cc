// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/passwords/leech_passwords.h"

#include <set>
#include <utility>

#include "base/functional/bind.h"
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/affiliations/affiliation_service_factory.h"
#include "chrome/browser/password_manager/factories/account_password_store_factory.h"
#include "chrome/browser/password_manager/factories/profile_password_store_factory.h"
#include "chrome/browser/profiles/profile.h"
#include "components/keyed_service/core/service_access_type.h"
#include "components/password_manager/core/browser/import/import_results.h"
#include "components/password_manager/core/browser/import/password_importer.h"
#include "components/password_manager/core/browser/password_form.h"
#include "components/password_manager/core/browser/password_manager_util.h"
#include "url/gurl.h"

namespace {

using password_manager::CredentialUIEntry;
using password_manager::ImportResults;
using password_manager::PasswordForm;

std::string Bare(const GURL& url) {
  const std::string host(url.host());
  return host.starts_with("www.") ? host.substr(4) : host;
}

// Why an import brought nothing in, in the panel's words; null when it worked.
const char* ImportFailure(ImportResults::Status status) {
  switch (status) {
    case ImportResults::SUCCESS:
      return nullptr;
    case ImportResults::BAD_FORMAT:
      return "That file is not a password CSV";
    case ImportResults::MAX_FILE_SIZE:
    case ImportResults::NUM_PASSWORDS_EXCEEDED:
      return "Too many passwords in one file";
    case ImportResults::IO_ERROR:
      return "The file could not be read";
    case ImportResults::IMPORT_ALREADY_ACTIVE:
      return "An import is already running";
    default:
      return "The passwords could not be brought in";
  }
}

}  // namespace

LeechPasswords::LeechPasswords(Profile* profile, base::RepeatingClosure changed)
    : changed_(std::move(changed)) {
  // A private window shows the passwords of the profile it came from, as Chromium's own page does.
  Profile* owner = profile->GetOriginalProfile();
  presenter_ = std::make_unique<password_manager::SavedPasswordsPresenter>(
      AffiliationServiceFactory::GetForProfile(owner),
      ProfilePasswordStoreFactory::GetForProfile(owner, ServiceAccessType::EXPLICIT_ACCESS),
      AccountPasswordStoreFactory::GetForProfile(owner, ServiceAccessType::EXPLICIT_ACCESS));
  importer_ = std::make_unique<password_manager::PasswordImporter>(*presenter_);
  observation_.Observe(presenter_.get());
  presenter_->Init(base::BindOnce(&LeechPasswords::Loaded, weak_factory_.GetWeakPtr()));
}

LeechPasswords::~LeechPasswords() = default;

void LeechPasswords::Call(const std::string& what, std::vector<std::string> args, Answer done) {
  if (!loaded_) {
    waiting_.push_back(base::BindOnce(&LeechPasswords::Respond, weak_factory_.GetWeakPtr(), what,
                                      std::move(args), std::move(done)));
    return;
  }
  Respond(what, args, std::move(done));
}

void LeechPasswords::OnSavedPasswordsChanged(const password_manager::PasswordStoreChangeList&) {
  changed_.Run();
}

void LeechPasswords::Loaded() {
  loaded_ = true;
  for (auto& call : std::exchange(waiting_, {})) {
    std::move(call).Run();
  }
}

void LeechPasswords::Respond(const std::string& what, const std::vector<std::string>& args, Answer done) {
  auto at = [&](size_t i) { return i < args.size() ? args[i] : std::string(); };
  if (what == "list") {
    std::move(done).Run(List());
  } else if (what == "reveal") {
    std::move(done).Run(Reveal(at(0), at(1)));
  } else if (what == "save") {
    std::move(done).Run(Save(at(0), at(1), at(2)));
  } else if (what == "forget") {
    Forget(at(0), at(1));
    std::move(done).Run(base::Value());
  } else if (what == "import") {
    importer_->Import(at(0), PasswordForm::Store::kProfileStore,
                      base::BindOnce(&LeechPasswords::Imported, weak_factory_.GetWeakPtr(), std::move(done)));
  } else {
    std::move(done).Run(base::Value());
  }
}

// One entry per site and username; Chromium groups affiliated sites into one credential, the panel lists each.
base::Value LeechPasswords::List() const {
  base::ListValue list;
  std::set<std::pair<std::string, std::u16string>> seen;
  for (const CredentialUIEntry& credential : presenter_->GetSavedPasswords()) {
    for (const auto& facet : credential.facets) {
      if (!facet.url.SchemeIsHTTPOrHTTPS() || !seen.insert({Bare(facet.url), credential.username}).second) {
        continue;
      }
      list.Append(base::DictValue()
                      .Set("host", Bare(facet.url))
                      .Set("user", base::UTF16ToUTF8(credential.username)));
    }
  }
  return base::Value(std::move(list));
}

base::Value LeechPasswords::Reveal(const std::string& host, const std::string& user) const {
  const auto credential = Find(host, base::UTF8ToUTF16(user));
  return credential ? base::Value(base::UTF16ToUTF8(credential->password)) : base::Value();
}

// 'saved', 'updated', 'same', or 'refused' for an address that is no web site, no password, or a store that says no.
base::Value LeechPasswords::Save(const std::string& site, const std::string& user, const std::string& password) {
  const GURL url = password_manager_util::StripAuthAndParams(password_manager_util::ConstructGURLWithScheme(site));
  if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS() || password.empty()) {
    return base::Value("refused");
  }
  const std::u16string name = base::UTF8ToUTF16(user);
  const std::u16string secret = base::UTF8ToUTF16(password);
  if (const auto kept = Find(Bare(url), name)) {
    if (kept->password == secret) {
      return base::Value("same");
    }
    CredentialUIEntry changed = *kept;
    changed.password = secret;
    const bool done = presenter_->EditSavedCredentials(*kept, changed) ==
                      password_manager::SavedPasswordsPresenter::EditResult::kSuccess;
    return base::Value(done ? "updated" : "refused");
  }
  CredentialUIEntry credential;
  password_manager::CredentialFacet facet;
  facet.url = url;
  facet.signon_realm = password_manager_util::GetSignonRealm(url);
  credential.facets.push_back(std::move(facet));
  credential.username = name;
  credential.password = secret;
  credential.stored_in = {PasswordForm::Store::kProfileStore};
  return base::Value(presenter_->AddCredential(credential) ? "saved" : "refused");
}

// Only the stored sign-ins for this host go, not the affiliated sites grouped with it.
void LeechPasswords::Forget(const std::string& host, const std::string& user) {
  const auto credential = Find(host, base::UTF8ToUTF16(user));
  if (!credential) {
    return;
  }
  for (const auto& stored : presenter_->GetCorrespondingStoredCredentials(*credential)) {
    if (Bare(stored.url) == host) {
      presenter_->RemoveCredential(CredentialUIEntry(stored));
    }
  }
}

// How many came in, or why none did. An account already kept with another password keeps it: a file never
// overwrites what is kept.
void LeechPasswords::Imported(Answer done, const ImportResults& results) {
  if (results.status == ImportResults::CONFLICTS) {
    importer_->ContinueImport({}, base::BindOnce(&LeechPasswords::Imported, weak_factory_.GetWeakPtr(),
                                                 std::move(done)));
    return;
  }
  const char* failure = ImportFailure(results.status);
  std::move(done).Run(failure ? base::Value(failure) : base::Value(static_cast<int>(results.number_imported)));
}

std::optional<CredentialUIEntry> LeechPasswords::Find(const std::string& host, const std::u16string& user) const {
  for (const CredentialUIEntry& credential : presenter_->GetSavedPasswords()) {
    if (credential.username != user) {
      continue;
    }
    for (const auto& facet : credential.facets) {
      if (facet.url.SchemeIsHTTPOrHTTPS() && Bare(facet.url) == host) {
        return credential;
      }
    }
  }
  return std::nullopt;
}
