// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/sandbox/leech_sandbox.h"

#include <map>

#include "base/memory/weak_ptr.h"
#include "base/no_destructor.h"
#include "base/task/sequenced_task_runner.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_destroyer.h"
#include "chrome/browser/ui/browser_commands.h"
#include "chrome/browser/ui/leech/leech_view.h"
#include "url/gurl.h"

namespace {

// Every live sandbox and the page its window still has to open (empty once the UI took it).
std::map<Profile*, std::string>& Sandboxes() {
  static base::NoDestructor<std::map<Profile*, std::string>> sandboxes;
  return *sandboxes;
}

}  // namespace

void LeechOpenSandbox(Profile* from, const GURL& url) {
  // Only web pages: a chrome:// page in a sandbox would be the browser's, not a site's.
  if (!url.SchemeIsHTTPOrHTTPS() && !url.is_empty()) {
    return;
  }
  // A DevTools context, as Target.createBrowserContext makes: of the off-the-record profiles besides the
  // primary one, only these may have browser windows.
  Profile* sandbox = from->GetOriginalProfile()->GetOffTheRecordProfile(
      Profile::OTRProfileID::CreateUniqueForDevTools(), /*create_if_needed=*/true);
  Sandboxes()[sandbox] = url.is_empty() ? std::string() : url.spec();
  chrome::OpenEmptyWindow(sandbox, /*should_trigger_session_restore=*/false);
}

bool LeechIsSandbox(Profile* profile) {
  return Sandboxes().contains(profile);
}

std::string LeechTakeSandboxPage(Profile* profile) {
  auto it = Sandboxes().find(profile);
  return it == Sandboxes().end() ? std::string() : std::exchange(it->second, std::string());
}

void LeechSandboxWindowClosed(Profile* profile) {
  if (!LeechIsSandbox(profile) || LeechView::AnyFor(profile)) {
    return;
  }
  Sandboxes().erase(profile);
  // Later, never inside the window's own teardown; the profile may be gone by then (browser shutdown).
  base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(
                     [](base::WeakPtr<Profile> profile) {
                       if (profile) ProfileDestroyer::DestroyOTRProfileWhenAppropriate(profile.get());
                     },
                     profile->GetWeakPtr()));
}
