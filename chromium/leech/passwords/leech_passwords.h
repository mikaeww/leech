// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_PASSWORDS_LEECH_PASSWORDS_H_
#define CHROME_BROWSER_UI_LEECH_PASSWORDS_LEECH_PASSWORDS_H_

#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/scoped_observation.h"
#include "base/values.h"
#include "components/password_manager/core/browser/ui/credential_ui_entry.h"
#include "components/password_manager/core/browser/ui/saved_passwords_presenter.h"

class Profile;

namespace password_manager {
class PasswordImporter;
struct ImportResults;
}  // namespace password_manager

// The Passwords panel's side of Chromium's password store (ADR 0011): the presenter and importer
// chrome://password-manager uses, so the UI lists, reveals, adds, changes, removes and imports what Chromium
// keeps and fills. Hosts go to and from the UI bare, without scheme or "www.". Not for saving after a sign-in
// or filling, which stay Chromium's.
class LeechPasswords : public password_manager::SavedPasswordsPresenter::Observer {
 public:
  using Answer = base::OnceCallback<void(base::Value)>;

  // `changed` runs whenever the store changes, from the panel or from anywhere else (a sign-in saved).
  LeechPasswords(Profile* profile, base::RepeatingClosure changed);
  ~LeechPasswords() override;

  // `what` is list, reveal (host, user), save (site, user, password), forget (host, user) or import (the CSV's
  // text). Calls made before the store has loaded wait for it; an unknown `what` answers null.
  void Call(const std::string& what, std::vector<std::string> args, Answer done);

 private:
  // password_manager::SavedPasswordsPresenter::Observer:
  void OnSavedPasswordsChanged(const password_manager::PasswordStoreChangeList& changes) override;

  void Loaded();
  void Respond(const std::string& what, const std::vector<std::string>& args, Answer done);
  base::Value List() const;
  base::Value Reveal(const std::string& host, const std::string& user) const;
  base::Value Save(const std::string& site, const std::string& user, const std::string& password);
  void Forget(const std::string& host, const std::string& user);
  void Imported(Answer done, const password_manager::ImportResults& results);
  std::optional<password_manager::CredentialUIEntry> Find(const std::string& host,
                                                          const std::u16string& user) const;

  base::RepeatingClosure changed_;
  std::unique_ptr<password_manager::SavedPasswordsPresenter> presenter_;
  std::unique_ptr<password_manager::PasswordImporter> importer_;
  base::ScopedObservation<password_manager::SavedPasswordsPresenter,
                          password_manager::SavedPasswordsPresenter::Observer>
      observation_{this};
  bool loaded_ = false;
  std::vector<base::OnceClosure> waiting_;
  base::WeakPtrFactory<LeechPasswords> weak_factory_{this};
};

#endif  // CHROME_BROWSER_UI_LEECH_PASSWORDS_LEECH_PASSWORDS_H_
