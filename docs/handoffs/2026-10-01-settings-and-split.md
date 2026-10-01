# 2026-10-01: split scrollbars, folders by right-click, Chromium's settings

Hand-off for the next agent. Historical: the state at the end of this session.

## Asked

Pages in a split jumped (scrollbars too) when moving into the other pane; a folder straight from a
right-click; settings covering Chromium's as well.

## Done (each committed and pushed)

- f883ac0: Chromium's tabbed layout set the split's 8 px inset every layout, LeechView::AfterLayout zeroed
  it and asked for another layout, so both pages flipped between two sizes. Patched at the layout; measured
  stable over 192 frames at 60 fps.
- 748d069: "New Folder with Tab" in the tab menu and the empty chrome's menu. Menus give focus back only
  when cancelled (a late page focus took it from the new folder's name field, and from Rename).
  This commit went in while `fold-glide` was failing (the command only checked grep's exit code).
- bd1dfea: the cause of that failure: the card's arrival animation held `transform` for its first 0.7 s;
  it animates `translate`/`scale` now. Commits since are gated on the exit codes of both checks.
- 050ee83: ADR 0004, `chromium/leech/services/leech_prefs.cc` with 25 settings by a fixed list, pages Sites,
  Languages, System and Chromium lines on Passwords, Downloads, Privacy, General; verified against
  Chromium's Preferences files (docs/verification/chromium-settings.md: 24 of 24, 5 of 5 refusals).

## Open

- Leech's ad blocking (shield) does nothing in the Chromium build and is hidden there now; bringing it to
  Chromium (a declarativeNetRequest ruleset or a URLLoader throttle) is not started.
- A Chromium setting outside the list is reachable only through the chrome://settings links.
