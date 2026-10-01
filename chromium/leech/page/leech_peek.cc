// Copyright 2026 The Leech Authors
// Use of this source code is governed by the MIT license in LICENSE.

#include "chrome/browser/ui/leech/page/leech_peek.h"

#include "chrome/browser/ui/leech/leech_view.h"
#include "components/input/native_web_keyboard_event.h"
#include "ui/base/metadata/metadata_impl_macros.h"

LeechPeek::LeechPeek(content::BrowserContext* context, LeechView* leech)
    : views::WebView(context), leech_(leech) {}

LeechPeek::~LeechPeek() = default;

content::KeyboardEventProcessingResult LeechPeek::PreHandleKeyboardEvent(
    content::WebContents* source,
    const input::NativeWebKeyboardEvent& event) {
  return leech_->TakeKey(event) ? content::KeyboardEventProcessingResult::HANDLED
                                : content::KeyboardEventProcessingResult::NOT_HANDLED;
}

bool LeechPeek::HandleKeyboardEvent(content::WebContents* source,
                                    const input::NativeWebKeyboardEvent& event) {
  return unhandled_keys_.HandleKeyboardEvent(event, GetFocusManager());
}

BEGIN_METADATA(LeechPeek)
END_METADATA
