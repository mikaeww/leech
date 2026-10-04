// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/leech_default_browser.h"

#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "base/environment.h"
#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/memory/scoped_refptr.h"
#include "base/task/thread_pool.h"
#include "chrome/browser/shell_integration.h"
#include "chrome/browser/shell_integration_linux.h"
#include "chrome/common/channel_info.h"

namespace {

// xdg-settings makes Leech the default for http, https and text/html but leaves application/xhtml+xml to
// whoever had it. Blocks on xdg-mime.
void ClaimXhtml() {
  const std::unique_ptr<base::Environment> env = base::Environment::Create();
  const std::vector<std::string> argv = {"xdg-mime", "default", chrome::GetDesktopName(env.get()),
                                         "application/xhtml+xml"};
  int exit_code = EXIT_FAILURE;
  if (!shell_integration_linux::LaunchXdgUtility(argv, &exit_code) || exit_code != EXIT_SUCCESS) {
    LOG(WARNING) << "Leech: xdg-mime could not claim application/xhtml+xml, exit " << exit_code;
  }
}

void Answered(bool make, base::OnceCallback<void(bool)> done, shell_integration::DefaultWebClientState state) {
  const bool is_default = state == shell_integration::IS_DEFAULT;
  if (make && is_default) {
    base::ThreadPool::PostTask(FROM_HERE, {base::MayBlock()}, base::BindOnce(&ClaimXhtml));
  }
  std::move(done).Run(is_default);
}

}  // namespace

void LeechDefaultBrowser(bool make, base::OnceCallback<void(bool)> done) {
  auto worker = base::MakeRefCounted<shell_integration::DefaultBrowserWorker>();
  auto answered = base::BindOnce(&Answered, make, std::move(done));
  if (make) {
    worker->StartSetAsDefault(std::move(answered));
  } else {
    worker->StartCheckIsDefault(std::move(answered));
  }
}
