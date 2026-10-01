# 0006: The shield in the Chromium build: declarativeNetRequest rules of a component extension

**Status:** accepted
**Date:** 2026-10-01

## Context
Leech's shield blocks Search's 44 ad and tracking hosts when another site loads them, pausable per site, and
hides the boxes they leave. The Electron shell blocks in `webRequest.onBeforeRequest`. The Chromium build had
nothing, so its settings hid the shield (ADR 0004's consequences). Requests leave the renderer straight for the
network service, so the browser process sees subresource loads only through an embedder hook.

## Options
- A URLLoader throttle: the renderer-side provider needs a patch in Chrome's renderer client, and the list and
  the pauses have to reach every renderer.
- Chromium's subresource filter with its own ruleset: built for EasyList-sized lists delivered by the component
  updater, switched on per site by Safe Browsing verdicts; bending it to 44 hosts and a per-site pause fights it.
- declarativeNetRequest, which Chromium already enforces in the network path: a component extension with only a
  manifest, whose dynamic rules the browser sets straight through `RulesMonitorService::UpdateDynamicRules`.

## Decision
The third. `chromium/leech/page/leech_shield.cc` adds the component (its key fixes its id; one line in the patch
puts the id on Chromium's component allowlist) and, on every `L.configure`, replaces its two rules: block the
hosts in `blocked` (from `ui/places/shield.js`) as `thirdParty`, and `allowAllRequests` on the paused sites,
which outranks the block. With the shield off there are no rules. The boxes are hidden by the page script's
sheet in both shells.

## Consequences
- The shield works in the Chromium build and its settings show there again.
- Third party is Chromium's own reading (the initiator's registrable domain, from the public suffix list), a
  little stricter than Electron's last-two-labels rule.
- The component is a component extension: it doesn't show in chrome://extensions or Leech's extension door.
- Private windows get no rules (an off-the-record profile would need the extension allowed in incognito).
