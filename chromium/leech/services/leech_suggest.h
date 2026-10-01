// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_SERVICES_LEECH_SUGGEST_H_
#define CHROME_BROWSER_UI_LEECH_SERVICES_LEECH_SUGGEST_H_

#include <memory>
#include <optional>
#include <string>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"

class Profile;

namespace network {
class SimpleURLLoader;
}

// Search suggestions for the address field: the engine the UI names is asked about the typed words,
// without cookies, one question at a time.
class LeechSuggest {
 public:
  using Answer = base::OnceCallback<void(std::optional<std::string>)>;

  LeechSuggest();
  ~LeechSuggest();

  // `done` gets the engine's raw OpenSearch reply, or nullopt for an engine it doesn't know, words it
  // won't send (empty, too long, a private window) or a failed fetch. A newer question drops the one
  // still out, whose answer is stale anyway; its `done` never runs.
  void Ask(Profile* profile, const std::string& engine, const std::string& typed, Answer done);

 private:
  void Answered(Answer done, std::optional<std::string> body);

  std::unique_ptr<network::SimpleURLLoader> loader_;
  base::WeakPtrFactory<LeechSuggest> weak_factory_{this};
};

#endif  // CHROME_BROWSER_UI_LEECH_SERVICES_LEECH_SUGGEST_H_
