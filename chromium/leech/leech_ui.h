// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#ifndef CHROME_BROWSER_UI_LEECH_LEECH_UI_H_
#define CHROME_BROWSER_UI_LEECH_LEECH_UI_H_

#include "content/public/browser/web_ui_controller.h"
#include "content/public/browser/webui_config.h"
#include "content/public/common/url_constants.h"

namespace leech {
inline constexpr char kLeechHost[] = "leech";
inline constexpr char kLeechURL[] = "chrome://leech/";
}  // namespace leech

class LeechUI;

class LeechUIConfig : public content::DefaultWebUIConfig<LeechUI> {
 public:
  LeechUIConfig()
      : DefaultWebUIConfig(content::kChromeUIScheme, leech::kLeechHost) {}
};

// chrome://leech: the browser's chrome, drawn from the ui/ folder of the Leech repo.
class LeechUI : public content::WebUIController {
 public:
  explicit LeechUI(content::WebUI* web_ui);
  LeechUI(const LeechUI&) = delete;
  LeechUI& operator=(const LeechUI&) = delete;
  ~LeechUI() override;
};

#endif  // CHROME_BROWSER_UI_LEECH_LEECH_UI_H_
