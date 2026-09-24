# Leech

A small, fast, quiet web browser for Linux.

Leech is a port of [Search](https://github.com/driceroland/Search), the macOS browser by [Office Commun](https://officecommun.com), to Linux. Same idea: a row of tabs — across the top or down the left — and the page. No toolbar, no start page, no account. It runs on **WebKitGTK**, the Linux build of the engine Search uses, so there is no bundled Chromium.

> **Status:** early. See [PLAN.md](PLAN.md) for what exists and what comes next.

## Building

Needs Rust 1.85+ and the GTK 4, libadwaita and WebKitGTK 6.0 development files.

```sh
# Arch
sudo pacman -S --needed rust gtk4 libadwaita webkitgtk-6.0
# Debian / Ubuntu (24.10+)
sudo apt install cargo libgtk-4-dev libadwaita-1-dev libwebkitgtk-6.0-dev

cargo run --release
```

## What it won't do

- **No DRM video.** WebKitGTK ships without Widevine, so Netflix, Disney+ and similar sites won't play.
- **No Chrome extensions** for now. WebKitGTK has no extension API.

## Credits

The design, behaviour and injected scripts come from Search by Office Commun (MIT). Leech is not affiliated with Office Commun.

## Licence

MIT, see [LICENSE](LICENSE).
